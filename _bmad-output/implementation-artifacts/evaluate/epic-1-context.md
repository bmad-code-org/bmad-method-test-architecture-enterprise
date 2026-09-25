# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An adopter describes a target (agent, skill, workflow, tool-use system, AI feature or test-review mechanism), answers Evaluate's questions, chooses or builds the evaluation layer, and gets a compiling, sealed, preflighted, scored Behavioral Evaluation Contract whose clean arm resolves `passed-clean-control` and whose mutated arm resolves `caught`, with every weaker result traced to a named gap and closed. TeA owns every layer above eval-quality's fixed measurement engine, including each concern the engine leaves to the caller: the evaluation layer, held-out probes, judge calibration, mutation and rollback, and interpretation. The epic closes when Evaluate has authored and run the suite for `bmad-testarch-evaluate` itself, authored strong suites for two more target kinds from their descriptions alone, closed seeded weaknesses through its gap loop, and succeeded with two named frameworks plus one its guides never mention. Stories 1.27 to 1.32 were appended from findings made while building Stories 1.6 to 1.9.

## Stories

- Story 1.1: Export eval-quality's HTTP target-policy evaluation and pack the engine locally
- Story 1.2: Run TeA's gate on the engine Evaluate needs
- Story 1.3: Register Evaluate as a TEA skill
- Story 1.4: Ship `tea-evaluate` with `check` and `digest`
- Story 1.5: Move the registry, records and provenance into the runtime
- Story 1.6: Probe a skill through the generic runner and `tea-evaluate preflight`
- Story 1.7: Mutate only in a disposable copy and prove the rollback
- Story 1.8: Run the clean and mutated arms and score them
- Story 1.9: Qualify gameability and historical probes, and judge rubrics
- Story 1.17: Drive any evaluation layer through one import contract
- Story 1.10: Evaluate a stdio MCP tool server
- Story 1.11: Scaffold the HTTP probe port for `api` targets
- Story 1.18: Evaluate a workflow target through `after` and `captured` bindings
- Story 1.19: Evaluate a tool-use calling agent through its own command, judged by AgentEvals
- Story 1.20: Import a second framework's results: promptfoo
- Story 1.21: Hold out probes and calibrate rubric judges
- Story 1.22: Attribute findings for interpretation
- Story 1.12: Inspect the target, capture requirements and design the corpus
- Story 1.13: Author the contract, oracles, rubrics and adapter wiring
- Story 1.23: Teach choosing and building the evaluation layer
- Story 1.14: Drive the run and interpret the gaps
- Story 1.15: Float the engine pin and admit Evaluate-authored suites
- Story 1.16: Evaluate authors its own suite, run live and recorded
- Story 1.24: Evaluate authors strong suites for two more target kinds
- Story 1.25: Close seeded weaknesses through the gap loop
- Story 1.26: Learn an unfamiliar evaluation framework on the go
- Story 1.27: Tell a documented guard from an invented risk in the test-design contract
- Story 1.28: Recover from a killed run
- Story 1.29: Record what a live run spends
- Story 1.30: Send `principal` and `matcher` bindings
- Story 1.31: Sandbox the target's file system
- Story 1.32: Qualify a historical probe against two addressable deployments

## Requirements & Constraints

- Inspection names the target kind and maps it to interface kind (`cli`, `api`, `mcp`) and adapter, asking when the description is ambiguous. A web application maps to `api`; no contract ever declares `web`. A request to evaluate a vendor model is redirected to the adopter's use of it, with the model held as a fixed condition of every run, judges and frameworks included.
- Intake writes a requirements statement the adopter confirms before corpus design starts.
- The corpus carries representative, negative/malformed and held-out probes (held-out chosen before oracles exist and never read in the gap loop), at least one `zero-action` clean control with `expectedClean: true`, a seeded-defect probe per behavior (or a recorded refusal with its reason), a `zero-action` defect probe per mandatory-action behavior, and a gameability probe per judgment-governed behavior.
- The contract compiles and seals with exit 0; each behavior has a non-null `observableSuccessCriterion` and, when a probe discharges it, exactly one oracle. A defect signature addresses only an exit code or a descriptor-nominated stream or response body.
- Every rubric judge is calibrated against adopter-labelled items before its scores count. The adopter sets `severityFloor`, `minimumTrialCount`, `catchThreshold` and `minimumAgreement`; templates carry no values.
- eval-quality performs no mutation, runs no target, and decides every enforced verdict through its exit codes. TeA keeps no copy of compile, seal, preflight reduction, scoring, strength or ingest checks (quotes, citations, signature matches).
- The runtime is framework-neutral and vendor-neutral: adding a framework changes neither `cli/` nor the engine. Versions float. No third-party individuals or employer-internal systems are named in generated or committed content.
- Every acceptance criterion names a revert check the worker exercises once and records in completion notes.

## Technical Decisions

- **Skill:** `bmad-testarch-evaluate`, menu code `EV`, lean shape (`SKILL.md`, `references/`, `assets/`, `customize.toml`; no `workflow.yaml`, `steps-*`, or skill-local `scripts/`). Twelve stage guides: inspection, intake, corpus, contract, oracles, adapters, evaluator, mutation, harness, run, gaps, ci. Each teaches its craft under exact headings; worked artifact fragments are fenced JSON tagged `<!-- example:<kind> -->` that `test:evaluate-guidance` validates or compiles through the real engine or runtime schema. Skill edits go through `/bmad-workflow-builder` headless, then Analyze (zero critical/high), Validate Module when registration files change, then `npm test`.
- **Runtime:** `tea-evaluate` (CommonJS, `cli/evaluate.js` over `cli/lib/evaluate/`) has seven subcommands: `check`, `digest`, `preflight`, `run`, `score`, `compare`, `ci`. It reads no `_bmad/` config and exits 64 when `--evaluation <path>` resolves nothing. `cli/lib/evaluate/engine.js` is the only file importing `eval-quality` (its own `evaluate-engine` dependency-direction layer); every other `cli/` file is held to the `cli` layer's `allow` list, which names no framework. `TEA_EVALUATE_ENGINE_CLI` substitutes a logging shim in tests. `cli/` never imports `test/`; `test/lib/` keeps only TeA data and TeA's eval-result vocabulary. eval-quality is an optional peer floored at `>=4.2.0`.
- **Verdict path:** the runtime drives preflight legs through `runPreflight` with a recording port and discards the library verdict; `compile`, `seal`, `preflight --observations --run-id` and `score` (once per probe, every trial's `--record`) run through the CLI over persisted, schema-validated files. `score` persists each call's exit code, stdout and stderr per probe and passes the most severe exit through (64, 5, 4, 3, 2, 0).
- **Mutation:** only in a disposable copy (detached git worktree at the evaluated commit, or a temp copy for a `copy` workspace or non-git target). Provisioned directories are copied read-only. `targetArtifact` resolves against `launch.root`; a skill target also declares `launch.skillRoot`. The plant, observe, restore, digest-check, baseline re-pass cycle (bounded by `reExecutionCap` from `policy/scoring-policy.json`) runs inside `preflight` ahead of its legs and writes the qualified probe to `runs/<invocationId>/probes/`. `rollbackVerified` is set only after the restore is proved; no `rollbackVerified: true` literal may appear under `cli/`. A manifestation-witness leg routes to the mutated copy, every other leg to the pristine copy. `run.json` records `dirty: true` only under `--from-working-tree`.
- **Run records:** one `invocationId` keys `runs/<invocationId>/`; one `runId` per trial set; `trialIndex` 1..N with N at least `minimumTrialCount`; `conditionArm` is `clean`, `mutated:<id>`, `historical:<rev>` or `gameability:<probeId>`. Requests come only from the contract's `interactionPlan`; this release sends `literal` bindings and stops with exit 12 on `captured` (Story 1.18), `principal` or `matcher` (Story 1.30). Scored trial observations carry `provenance: evaluator-chosen` (the engine's witness match counts no other); qualification arms and bridge-driven plan steps under a sealed-brief agent stay `baseline`. `evaluatorRecommendation` is computed over the whole trial set. A run using no model records `modelSnapshot: "none"` and `systemPromptDigest` over the empty byte string. `implementationDigest` excludes the evaluation folder; a clean control's `artifactDigest` equals its `implementationDigest`. An infrastructure exit code from the registry yields no record and exit 12.
- **Isolation and integrity:** one `IsolationManifest` per trial set, listing only what the runtime observed (no mounts or network targets until Story 1.31 confines the file system). `run.json` anchors every file `score` reads; a run directory entry the runtime did not write exits 12. Resource use is recorded as zero until Story 1.29.
- **Evaluation layer:** `evaluation.json` `evaluator.kind` is `deterministic` (default, `resolveCheck`), `sealed-brief-agent` (sealed brief plus row instructions only, acting through the stdio MCP bridge `cli/lib/evaluate/bridge.js`), `command` (adopter executable reading `{ sealedBrief, observations }`, printing judgment rows mapped through `evaluator/mapping.json`, bounded by `evaluator.timeoutMs`), or `records` (adopter-sealed records passed through). TeA's own conditions go under `decodingParameters` keys `tea.evaluatorKind`, `tea.evaluatorExecutableDigest`, `tea.evaluatorTreeDigest` and `tea.judgeCalibrationDigest`. Framework code lives only in an adopter's `evaluator/` folder.
- **Held-out and interpretation:** `run --partition development|held-out` (default both); `score` writes `partitions.json`, `gap-view.json` (held-out probes as ID, class and outcome only) and `interpretation.json` (findings traced to observations and oracle evidence pointers, split by `operationPhases` into process and outcome, first material error as the lowest-`sequence` cited observation of a `material` or `critical` finding). Every outcome, verdict and strength value is copied byte for byte from the evidence artifact.
- **Exit classes:** eval-quality's 0/2/3/4/5/64 pass through verbatim. `tea-evaluate` adds 10 (authoring defect), 11 (evaluation weakness: mutation that does not manifest, baseline that does not pass, judge below agreement), 12 (infrastructure, evaluator crash or out-of-contract output, run-directory tampering), 13 (evidence drift) and 64 (wiring).
- **Layout:** an evaluation lives at `{tea_evaluations_folder}/<evaluationId>/` (`test/evaluations` in TeA) with `evaluation.json`, `contract.json`, `probes/P-NNN.probe.json`, `mutations/M-NNN.mutation.json` (`replace-exact`, occurrence exactly 1), `corpus/`, `corpus-index.json` (sorted `{path, sha256}`, digested with `digestArtifact`), `policy/`, `evaluator/`, `adapter/` (api only), `baseline/` (committed) and `runs/` (gitignored). Committed probes hold authored fields only. Drafts such as the requirements statement go to `{test_artifacts}/evaluate/<evaluationId>/`. Artifacts are canonical JSON through `serializeArtifact`.
- **Test house style:** plain Node scripts with `node:assert`, each chained into `npm test` as `test:<name>` with its own `quality.yaml` step (`test:ci-coverage` enforces it). Stub targets and loopback fixtures under `test/fixtures/`; live runs go through the local Claude Code CLI on the owner's subscription (no API key, no spending approval) and never enter `npm test`. The engine check runs at the start and end of each story, and `package.json`/`package-lock.json` never carry a `file:` or `.tgz` spec.

## Cross-Story Dependencies

Stories 1.1 through 1.9 run in sequence; 1.1 ships the target-policy export (released in eval-quality 4.0.0) and 1.2 moves TeA onto that release. From 1.8 the graph branches: 1.9 feeds 1.17 (the import contract), on which 1.19, 1.20, 1.21 and 1.22 each build; 1.10 and 1.18 need only 1.8; 1.11 needs 1.1 and 1.8. 1.12 needs 1.4 and 1.21; 1.13 needs 1.10, 1.11, 1.12, 1.18 and 1.19; 1.23 needs 1.13, 1.19, 1.20 and 1.21; 1.14 needs 1.9, 1.13, 1.22 and 1.23. Then 1.15, 1.16, 1.24 and 1.25 run in sequence, and 1.26 needs 1.23 and 1.25. The appended stories hang off earlier work: 1.27 and 1.28 off 1.7; 1.29, 1.30 and 1.31 off 1.8; 1.32 off 1.9 and 1.11. Story 1.13 teaches the `captured`, `principal` and `matcher` bindings that 1.18 and 1.30 make the runtime send. Epic 2 depends on this epic's runtime and on the evaluation Story 1.16 authors, and its Story 2.1 waits for 1.16 and 1.26.
