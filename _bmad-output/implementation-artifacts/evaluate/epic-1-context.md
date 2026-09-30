# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An adopter describes a target (agent, skill, workflow, tool-use system, AI feature or test-review mechanism), answers Evaluate's questions, chooses or builds the evaluation layer, and gets a compiling, sealed, preflighted, scored Behavioral Evaluation Contract whose clean arm resolves `passed-clean-control` and whose mutated arm resolves `caught`, with every weaker result traced to a named gap and closed. TeA owns every layer above eval-quality's fixed measurement engine, including each concern the engine leaves to the caller: the evaluation layer, held-out probes, judge calibration, mutation and rollback, target isolation and interpretation. The core loop closed with Evaluate authoring and running the suite for `bmad-testarch-evaluate` itself, authoring strong suites for two more target kinds, closing seeded weaknesses through its gap loop, and succeeding with a framework its guides never mention. Stories 1.27 to 1.63 were appended from findings made while building it; they harden the runtime (denial reasons, crash and binding edge cases, killed-run recovery, file-system confinement), move rules TeA still copies into eval-quality releases, and close the dogfood suite's and the test-design evaluation's remaining gaps.

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
- Story 1.33: Record eval-quality's denial reason for every denied call
- Story 1.34: Qualify a sealed-brief agent evaluator before its verdicts count
- Story 1.35: Judge a tool server that crashes mid-call
- Story 1.36: Hold an HTTP entry to eval-quality's own target-policy parser
- Story 1.37: Know a started HTTP server by the port it bound itself
- Story 1.38: Hold a deployment to the release it reports
- Story 1.39: Tell a captured value too large to launch from a target that cannot run
- Story 1.40: Calibrate rubric scores imported from harness records
- Story 1.41: Confine score output during concurrent run-directory changes
- Story 1.42: Attribute reused operation IDs to their interfaces
- Story 1.43: Keep ungraded framework errors out of target findings
- Story 1.44: Record installed framework versions in evaluator provenance
- Story 1.45: Aggregate development strength through eval-quality
- Story 1.46: Close the dogfood suite's coverage gaps
- Story 1.47: Distinguish reference risk tables from the scored register
- Story 1.48: Report whole-document coverage for a structured design artifact
- Story 1.49: Prove test-design mutation rollback before claiming it
- Story 1.50: Send malformed raw HTTP bodies through an API probe
- Story 1.51: Isolate interaction plans by evaluation partition
- Story 1.52: Stop agent descendants on Windows
- Story 1.53: Bound an agent whose guardian is stopped
- Story 1.54: Reclaim auxiliary scratch after a killed preflight
- Story 1.55: Recognize process and answer separation for scalar CLI output
- Story 1.56: Prove the malformed CLI refusal against a controlled defect
- Story 1.57: Withhold the committed evaluation folder from a confined target's git history
- Story 1.58: Keep the bridge's admission token and the run's private directories from a confined target
- Story 1.59: Let a confined agent target keep the state its CLI writes
- Story 1.60: Observe every confined process's file access, beyond Node
- Story 1.61: Teach file-system confinement in the Evaluate skill
- Story 1.62: Share one sandbox primitive layer across TeA's isolation modules
- Story 1.63: Carry the audit over a channel the target cannot write

## Requirements & Constraints

- eval-quality is the fixed measurement engine: it performs no mutation, runs no target, and decides every enforced verdict through its exit codes. TeA keeps no copy of compile, seal, preflight reduction, scoring, strength, aggregation or policy-parsing rules. Every outcome, verdict and strength value TeA writes is copied byte for byte from an engine evidence artifact. When TeA needs an engine rule it lacks, the coordinator ships it in an eval-quality release first; TeA then consumes it and parses no engine prose in its place.
- Inspection maps target kind to interface kind (`cli`, `api`, `mcp`) and adapter, asking when ambiguous. A web application maps to `api`; no contract declares `web`. A vendor model is evaluated only through the adopter's use of it, and every model (target, agent evaluator, judge, model-graded framework) is a fixed condition recorded in `EvaluatorConfiguration`.
- The corpus carries representative, malformed and held-out probes (held-out chosen before oracles exist and kept out of the gap loop), at least one `zero-action` clean control with `expectedClean: true`, a seeded-defect probe per behavior or a recorded refusal with its reason, and a gameability probe per judgment-governed behavior. Each discharged behavior has exactly one oracle; a defect signature addresses only an exit code or a descriptor-nominated stream or body.
- Every judge, and any evaluator whose verdict can vary between attempts, is qualified or calibrated against adopter-owned items before its results count; agreement below the adopter's threshold is an evaluation weakness (exit 11). Thresholds (`severityFloor`, `minimumTrialCount`, `catchThreshold`, `minimumAgreement`, strength floors) are set by the adopter; templates carry no values.
- Framework-neutral and vendor-neutral runtime: adding a framework changes neither `cli/` nor the engine. Framework code and its version declarations live only in the adopter's `evaluator/` folder. Versions float. No third-party individuals or employer-internal systems are named.
- Every acceptance criterion names a revert check the worker exercises once and records in completion notes. A reference passage a story adds is held by a test that reads it under its exact heading.

## Technical Decisions

- **Skill:** `bmad-testarch-evaluate`, menu code `EV`, lean builder shape (`SKILL.md`, `references/`, `assets/`, `customize.toml`). Stage guides teach their craft under exact headings; worked fragments are fenced JSON tagged `<!-- example:<kind> -->` that `test:evaluate-guidance` validates through the real engine or runtime schema. Skill edits go through `/bmad-workflow-builder` headless, then Analyze (zero critical/high), Validate Module when registration files change, then `npm test`.
- **Runtime:** `tea-evaluate` (`cli/evaluate.js` over `cli/lib/evaluate/`), subcommands `check`, `digest`, `preflight`, `run`, `score`, `compare`, `ci`. `cli/lib/evaluate/engine.js` is the only `cli/` file importing `eval-quality`; `test:direction` and `test:evaluate-boundaries` hold that. eval-quality floats as a devDependency and is an optional peer with a floor that engine-consuming stories raise.
- **Verdict path:** the library drives preflight legs and its verdict is discarded; `compile`, `seal`, `preflight` and `score` run through the eval-quality CLI over persisted, schema-validated files, and `score` passes the most severe engine exit through.
- **Mutation:** only in a disposable copy (detached worktree at the evaluated commit, or a temp copy). Plant, observe, restore, digest-check and clean re-pass run before `rollbackVerified` is set. Workspaces carry a marker naming run and process; the next `preflight` reclaims a dead run's workspaces and worktree registrations and leaves live ones alone. The historical route takes a `fixCommit` or a pair of `deployments` the registry authorizes.
- **Run records:** one `invocationId` keys `runs/<invocationId>/`; one `runId` per trial set; `conditionArm` is `clean`, `mutated:<id>`, `historical:<rev>` or `gameability:<probeId>`. Requests come only from the contract's `interactionPlan`; the runtime sends `literal`, `captured`, `principal` (credential from the evaluation's principal mapping, principal name recorded, credential kept out of records) and `matcher` (value chosen from the input schema with a seed recorded in `run.json`) bindings. Scored observations carry `provenance: evaluator-chosen`; qualification arms stay `baseline`. Trial token and cost use comes from what the runner reports, with unreported use marked in `run.json`. A registry `infrastructureExitCodes` hit yields no record and exit 12. Every denial records `{ code, reason, detail }` with eval-quality's own reason.
- **Confinement and integrity:** each trial's target runs under Seatbelt (macOS) or Bubblewrap (Linux). It cannot read or write the evaluation folder or write outside its workspace and the private directories the runtime hands it; other reads are allowed and reported by a Node preload audit into the isolation manifest's `observedMounts`. Evaluation-layer processes hold the evaluation folder read-only. A host with no mechanism exits 12 unless `evaluation.json` opts out with `"confinement": false`, which `run.json` records. `run.json` anchors every file `score` reads; an entry the runtime did not write exits 12. Stories 1.57 to 1.63 close the confinement's known holes (git history, bridge token, agent home state, non-Node audit, audit channel) and deduplicate sandbox primitives across `cli/lib/isolate.js`, `cli/lib/atdd-isolation.js` and `cli/lib/evaluate/confinement.js`.
- **Evaluation layer:** `evaluator.kind` is `deterministic` (default), `sealed-brief-agent` (acts through the stdio MCP bridge), `command` (adopter executable, judgment rows mapped through `evaluator/mapping.json`) or `records` (adopter-sealed records). TeA's own conditions go under `decodingParameters` keys prefixed `tea.`. An ungraded framework result is an evaluation failure (exit 12, no record); only a graded assertion becomes target evidence.
- **Held-out and interpretation:** `run --partition development|held-out`; `score` writes `partitions.json`, `gap-view.json` (held-out as ID, class and outcome only) and `interpretation.json` (findings traced to observations, split into process and outcome phases, first material error named).
- **Exit classes:** eval-quality's 0/2/3/4/5/64 pass through verbatim. `tea-evaluate` adds 10 (authoring defect), 11 (evaluation weakness), 12 (infrastructure, evaluator failure, integrity or confinement refusal), 13 (evidence drift) and 64 (wiring).
- **Layout:** `{tea_evaluations_folder}/<evaluationId>/` (`test/evaluations` in TeA) holds `evaluation.json`, `contract.json`, `probes/`, `mutations/` (`replace-exact`, occurrence exactly 1), `corpus/`, `corpus-index.json`, `policy/`, `evaluator/`, `adapter/` (api only), committed `baseline/` and gitignored `runs/`. Drafts go to `{test_artifacts}/evaluate/<evaluationId>/`. Artifacts are canonical JSON through `serializeArtifact`.
- **Test house style:** plain Node scripts with `node:assert`, each joining the `npm test` chain as `test:<name>`; the sharded `chain` job in `quality.yaml` runs it, held by `test:ci-coverage` and `test:shards`. Stubs and loopback fixtures live under `test/fixtures/`. Live runs use the local Claude Code CLI on the owner's subscription and stay out of `npm test`. Run the engine check at the start and end of each story; `package.json` and `package-lock.json` never carry a `file:` or `.tgz` spec. Engine-consuming stories also run `npm run test:release-metadata`.

## Cross-Story Dependencies

Stories 1.1 to 1.33 and 1.37 have landed; the rest run in the order listed above. Engine-consuming stories (1.35, 1.36, 1.39, 1.42, 1.45, 1.48, 1.50, 1.55) each need a published eval-quality release carrying the change before TeA raises its floor. The appended stories hang off earlier work: 1.34 and 1.40 off 1.17 and 1.21; 1.35 off 1.10; 1.36 off 1.11; 1.38 off 1.32; 1.39 off 1.18; 1.41 off 1.8 and 1.21; 1.42 off 1.22; 1.43 and 1.44 off 1.23; 1.45 off 1.8, 1.14 and 1.21; 1.46 off 1.16; 1.47 to 1.49 off 1.27; 1.50 and 1.51 off 1.24; 1.52 to 1.54 off 1.28; 1.56 off 1.55; 1.57 to 1.63 off 1.31. Epic 2 depends on this epic's runtime and on Story 1.16's evaluation; Story 2.1 waits for 1.16, 1.26 and 1.45.
