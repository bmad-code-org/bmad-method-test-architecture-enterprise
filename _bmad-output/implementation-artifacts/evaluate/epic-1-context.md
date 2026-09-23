# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 builds the full authoring loop: given a description of an adopter's target, Evaluate identifies its kind, captures the behavior to measure, designs a probe corpus with held-out probes set aside before oracles are written, authors a compiling Behavioral Evaluation Contract, wires the adapter the target needs, chooses or builds an evaluation layer behind one framework-neutral import contract, calibrates any rubric judge, scaffolds a controlled mutation with a proved rollback, and drives eval-quality's compile, seal, preflight and score stages end to end, then attributes each finding to the observations it rests on. The clean arm must resolve `passed-clean-control` and the mutated arm must resolve `caught`, with any weaker verdict traced to a specific missing probe, control, or oracle and closed through the gap loop. The epic closes only when Evaluate has authored its own suite for `bmad-testarch-evaluate`, proven the guidance on two further target kinds from their descriptions alone, closed seeded weaknesses through the gap loop, and succeeded with two evaluation frameworks plus one its guides never name. That is the bar the 2026-09-23 plan amendment set for a fully stacked Evaluate, one where TeA owns every layer above eval-quality's measurement engine.

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

## Requirements & Constraints

- Identify the target kind (agent, skill, workflow, tool-use system, AI feature, or test-review mechanism), map it to interface kind (`cli`, `api`, `mcp`) and adapter shape, asking when ambiguous; a web application always maps to `api`, no contract ever declares kind `web`, and a request to evaluate a vendor model itself is redirected to the adopter's own use of it.
- Capture the behavioral requirements inspection cannot infer, as a written statement the adopter confirms before corpus design starts.
- Design a probe corpus per target kind: representative, negative/malformed, and held-out inputs (chosen before oracles are written, never read during the gap loop), at least one `zero-action` clean control, a seeded-defect probe per behavior (or refused with a reason), a `zero-action` defect probe per mandatory-action behavior, and a gameability probe per rubric- or judgment-governed behavior, plus corpus layout and digest.
- Author a contract whose identity and lineage fields are stamped, that compiles and seals with exit 0, where every behavior carries a non-null observable success criterion, exactly one designated oracle with a resolvable evidence pointer, and a compiling anchored rubric wherever judgment needs a scale, judged only by a judge calibrated against adopter-labelled examples first.
- Scaffold the runner command, MCP wiring, or HTTP port and register it in an execution-target registry, so a real observation reaches preflight with no authorization denial.
- Apply and roll back each controlled mutation with baseline-pass, mutated-fail evidence, and `rollbackVerified: true` backed by a performed rollback; a historical-route probe carries fail-before/pass-after evidence, a refused probe carries its reason, and every admitted manifestation witness resolves at preflight.
- Generate a scoring policy, evaluator configuration, and isolation manifest valid against the engine's schemas with every threshold set by the adopter; run the clean and mutated arms through the chosen evaluation layer, seal the records, and drive compile, seal, preflight, and score end to end so the clean arm resolves `passed-clean-control` and the seeded probe resolves `caught`.
- For a CONCERNS, FAIL, or Invalid result, or a weak strength vector: name the unsatisfied rule, failed check, missing evidence, or loose oracle; separate process from outcome findings; name the first material error; then author, rerun, and rescore the fix.
- Build or choose the evaluation layer (TeA's deterministic evaluator, a sealed-brief agent evaluator, an adopter harness that seals its own records, a skill-specific evaluator, custom code, or any external framework, including one absent from Evaluate's guides) and bring its results into eval-quality evidence through one framework-neutral import contract; hold probes out of the authoring loop and report them as a separate partition.
- The measurement engine is fixed, performs no mutation, and executes no target; TeA's runtime keeps no copy of its compile, seal, preflight reduction, scoring, or strength logic, and enforces every behavioral verdict only through the engine's exit codes (a separate repository-policy gate enforces policy alone).
- Only `cli`, `api`, and `mcp` interface kinds are ever emitted; a defect signature addresses only an exit code or a descriptor-nominated stream or response body, never a file the target wrote; a behavior discharged by a probe declares exactly one oracle; versions float, with nothing pinned to an older engine release.
- The system under test is always the adopter's own use of a vendor dependency, with the model a fixed condition of every run; no third-party individuals or employer-internal systems are named in generated content; adding an evaluation framework needs no change to the CLI layer or the engine, whose dependency-direction allow list names no framework.

## Technical Decisions

- One skill, `bmad-testarch-evaluate`, menu code `EV`, in TEA's lean shape only: `SKILL.md`, `references/` (twelve stage guides: inspection, intake, corpus, contract, oracles, adapters, evaluator, mutation, harness, run, gaps, ci), `assets/` templates, `customize.toml`; no `workflow.yaml`, `steps-c/e/v`, or skill-local `scripts/`, since deterministic work lives in the runtime. A stage guide's worked contract/oracle/rubric/mutation/plan fragments are tagged fenced JSON the guidance test validates or compiles through the same engine or schema a real artifact meets, so a drifted example fails the gate.
- Target kind, recorded only in `evaluation.json`, fixes the adapter: skill, agent, and tool-use calling agent map to `cli` through one generic command-line adapter (the calling agent's trajectory on stdout); a tool server maps to `mcp`; an AI feature or web application maps to `api` through an adopter-owned HTTP probe port delegating every address decision to the engine's exported policy evaluator; a workflow runs over its own target's kind with `after`/`captured` bindings resolved in dependency order.
- `tea-evaluate` is the single driver: one CommonJS CLI (`check`, `digest`, `preflight`, `run`, `score`, `compare`, `ci`) reaching the ESM-only engine through one async loader, reading no `_bmad/` config, exiting 64 when `--evaluation <path>` resolves nothing. The engine is an optional peer dependency floored at `>=4.0.0`.
- Every enforced verdict comes from the eval-quality CLI over persisted files (`compile`, `seal`, `preflight --observations`, `score` once per probe); the library's own preflight verdict is discarded. The runtime only plans and drives preflight legs through a recording port, routing the leg a defect's manifestation witness names to the mutated (or pre-fix) copy, every other leg to the pristine copy.
- The evaluation layer is chosen per evaluation behind one framework-neutral import contract (`evaluation.json`'s `evaluator.kind`): `deterministic` (the default `resolveCheck` evaluator), `sealed-brief-agent` (acts on the target only through a vendor-neutral stdio MCP bridge, seeing the sealed brief with the contract's own checks, plan, and test data withheld), `command` (an adopter executable printing judgment rows the runtime converts to sealed-run-record findings via `evaluator/mapping.json`), or `records` (an adopter harness sealing its own records, validated and passed through). Framework-specific code lives only in an adopter's `evaluator/` folder, guarded by the CLI layer's framework-free dependency-direction allow list plus a secondary name scan.
- Held-out probes and judge calibration belong to TeA, since eval-quality leaves both to the caller: `run --partition` selects development, held-out, or both; `score` writes `partitions.json` and a `gap-view.json` holding back held-out rationale and test data (ID, class, outcome only). A rubric judge runs uncounted against labelled calibration items before its first real trial; agreement below the adopter's threshold blocks with no trial record.
- Interpretation stops at the engine's boundary: `score` writes `interpretation.json` tracing each finding to the observations and oracle evidence pointers it cites, split into process and outcome, naming the first material error as the lowest-sequence observation among material/critical findings, with every outcome, verdict, and strength value copied byte for byte from the evidence artifact.
- Mutation happens only in a disposable copy (a detached git worktree for a git target, a temp copy otherwise) through a fixed plant, observe, restore, verify cycle; `rollbackVerified: true` is set only once the restore is proved and the adopter's working tree is confirmed untouched.
- Run records share one shape (`invocationId`/`runId`/`trialIndex`/`conditionArm`), one isolation manifest per trial set, and per-registry infrastructure exit codes, so an infrastructure failure never reads as a quality score; a run using no model still fills the schema (`modelSnapshot: "none"`, `systemPromptDigest` over the empty byte string).
- Every story ends with `npm test` green (plus `test:release-metadata` for a `package.json`, workflow, or release change). A story touching the skill directory runs builder Analyze (zero critical/high findings) after implement and before review, plus Validate Module on a staged layout when registration files changed. Live evaluation runs execute through the local Claude Code CLI on the owner's subscription, needing no API key or spending approval, and each acceptance criterion names a revert check exercised once.

## Cross-Story Dependencies

Stories 1.1 through 1.9 run strictly in sequence: 1.1 exports eval-quality's target-policy evaluation (released as eval-quality 4.0.0), and 1.2 raises TeA's devDependency to it so every later story runs on that published engine. From 1.8 the graph branches: 1.9 (gameability, historical, and rubric probes) feeds 1.17, which establishes the framework-neutral import contract that 1.19 (AgentEvals), 1.20 (promptfoo), 1.21 (held-out probes and judge calibration), and 1.22 (interpretation) each build on. In parallel, 1.10 (MCP) and 1.18 (workflow bindings) depend only on 1.8, and 1.11 (HTTP `api`) depends on both 1.1 and 1.8. 1.12 (inspection, intake, corpus design) needs 1.4 and 1.21; 1.13 (contract, oracles, adapters) needs every adapter-kind story at once (1.10, 1.11, 1.12, 1.18, 1.19); 1.23 (choosing the evaluation layer) needs 1.13, 1.19, 1.20, and 1.21. 1.14 (run and gap interpretation) needs 1.9, 1.13, 1.22, and 1.23; 1.15 and 1.16 close the dogfood proof in sequence. 1.24 (two further target kinds), 1.25 (closing seeded weaknesses), and 1.26 (an unfamiliar framework) run last, each depending on the one before it. Epic 2's CI wiring depends on this epic's runtime and on the evaluation Story 1.16 authors.
