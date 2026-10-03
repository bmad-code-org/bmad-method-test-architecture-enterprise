# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

An adopter describes a target, confirms its required behavior, and chooses or builds an evaluation layer. Evaluate produces a compiling, sealed, preflighted and scored Behavioral Evaluation Contract, proves clean behavior and detection of controlled defects, and traces weaker results to gaps the adopter can close. Its guidance must work for its own skill, two further target kinds and a framework learned from primary sources. Appended stories harden the runtime, engine boundary, confinement, evidence integrity and CI proof exposed by that work.

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
- Story 1.63: Give a Bubblewrap target no route to the host's abstract sockets
- Story 1.64: Hold the release across the witness legs and the trials
- Story 1.65: Ask every HTTP interface of a deployment which release it runs
- Story 1.66: Scrub an observation in every letter case
- Story 1.67: Emit the label-free calibration inputs a records harness feeds its scorer
- Story 1.68: Hold a run's score inputs between verification and the engine's read
- Story 1.69: Hold the inputs of an evaluator attempt's score call
- Story 1.70: Refuse promptfoo assertions that run adopter code or call a model
- Story 1.71: Bound a framework version probe with its own timeout
- Story 1.72: Observe the sealed-brief agent evaluator's installed adapter version
- Story 1.73: Bind the declared frameworks' install state, not only their versions
- Story 1.74: Scrub an echo whose letters change case unevenly and reach the evidence as \uXXXX escapes
- Story 1.75: Name a report-operation signature collision at check, before the run
- Story 1.80: Bring a partial-clone project, its tags and a very large history into the withheld repository
- Story 1.81: Record how much of the macOS audit the kernel's log lost
- Story 1.82: Give a Bubblewrap target no route to the host's path-based Unix sockets
- Story 1.83: Give a confined Linux target a route to the hosts its registry entry authorizes
- Story 1.84: Teach a Linux skill target's network declaration in the CI guide and rerun its live sessions
- Story 1.90: Verify the baseline manifest's file digests
- Story 1.91: Keep machine paths out of a committed baseline
- Story 1.92: Stop `tea-evaluate ci` at once on a signal while an engine stage runs
- Story 1.93: Prove the merge, scheduled and release rendering and the re-render of evaluation plans
- Story 1.94: Score each stored workflow in the CI probe leg
- Story 1.95: Gate the replay totals, the story count and the lane lists
- Story 1.96: Check the derivable fields of a CI plan
- Story 1.97: Gate an existing publish or deploy job on the evaluation job
- Story 1.98: The AI-feature evaluation passes its own CI tiers
- Story 1.99: Prove mutation rollback for the test-review, trace, nfr and ci probe corpora
- Story 1.100: Report whole-body coverage for the routing, test-review and trace contracts
- Story 1.101: Name a stale stamp on every artifact `score` reads
- Story 1.102: Refuse a duplicate interface identifier at compile
- Story 1.103: Prove the Story 1.42 review fixes against their mutants
- Story 1.104: Count only behavior-linked oracles for success separation
- Story 1.105: Partition rubrics in a partition plan
- Story 1.106: Partition waivers in a partition plan
- Story 1.107: Partition evaluator mappings in a partition plan
- Story 1.108: Compile and seal each partition view in `ci`
- Story 1.109: Partition gameability degenerate responses
- Story 1.110: Designate one oracle per behavior in the both view
- Story 1.111: Guide Stage 6 preflight by partition and refuse an unpartitioned plan preflight
- Story 1.76: Require an explicit custom-agent version response

## Requirements & Constraints

- Inspect target behavior and map it to `cli`, `api` or `mcp`; a web application uses its HTTP surface as `api`. Confirm inferred requirements and admissible evidence with the adopter before corpus design.
- Build representative, malformed, clean-control, seeded-defect, gameability and held-out probes. Choose held-out probes before writing oracles. A behavior discharged by a probe has exactly one designated oracle. A defect signature addresses an exit code or the descriptor-nominated output channel; refuse an unsupported probe with its reason.
- Compile and seal the contract. Preflight real observations. Run clean and defect arms through the chosen evaluator, and let eval-quality score the records. Clean controls resolve `passed-clean-control`; witnessed defects resolve `caught`. Prove mutation rollback with restored bytes, verified digest and a clean re-pass before claiming it.
- Qualify variable evaluators and calibrate rubric judges against adopter-owned examples. The adopter sets thresholds. Keep full held-out material outside the authoring gap loop, while reporting that partition's outcomes.
- Explain failed rules, missing evidence and weak strength from engine artifacts; trace interpretation findings to observations. Each acceptance criterion has a revert check exercised during the story. A user-facing change adds an Unreleased changelog entry and passes its required gates.
- Keep framework-specific code in the adopter's `evaluator/` folder. Float engine and framework versions; record the versions and conditions actually used. Model-backed runs evaluate the adopter's use of the model, with the model captured as a fixed condition. Public artifacts avoid private systems and individuals.

## Technical Decisions

- TeA owns target execution, the evaluation layer, corpus, mutation, rollback, calibration, interpretation and CI wiring. eval-quality owns contract validation, sealing, probe qualification, preflight reduction, evidence verification, scoring and strength. The engine runs through its CLI; its evidence artifacts and exit codes decide enforced verdicts. An engine rule change ships in eval-quality before TeA consumes it.
- One `bmad-testarch-evaluate` skill guides the authoring stages, and `tea-evaluate` drives `check`, `digest`, `preflight`, `run`, `score`, `compare` and `ci`. A framework-neutral import contract accepts deterministic, sealed-brief-agent, command and records evaluators. Evaluation folders hold committed contracts, corpus, policy, adapters, evaluator and baseline; runs are separate.
- Run records identify invocation, trial set, trial index and condition arm. Target calls obey the contract's interaction plan and registry authorization. Mutation runs in a disposable copy. Scoring reads integrity-bound run inputs and copies engine outcomes, verdicts and strength into partition and interpretation artifacts.
- Target confinement restricts access to the evaluation folder and runtime secrets, audits access and keeps writable state within permitted workspaces and private directories. Historical probes bind to declared releases across witness and trial legs. Infrastructure, evaluator and integrity failures remain separate from target findings.
- Evaluate-authored committed suites coexist with generator-owned suites. `bmad-testarch-ci` owns CI rendering; Epic 1 supplies the runtime and evidence that Epic 2 places into tiers. Every story closes with the prescribed focused checks and `npm test`.

## Cross-Story Dependencies

- Story 1.1 established the published engine export; Story 1.2 adopted it. Later engine changes publish before a TeA dependency update. Story 1.56 depends on the Story 1.26 pantry evaluation and Story 1.55's published scalar-CLI rule.
- After Story 1.40, three serial lanes merge into `main` independently. Lane 1 handles run integrity, scoring and evaluators; lane 2 handles confinement and process lifecycle; lane 3 handles engine releases, dogfood and Epic 2. Lane 3 owns engine publication. Story 2.5 waits for committed evidence changes, and Story H.1 follows the drained lanes and the later engine patch in Story 1.104.
- Epic 2 consumes this epic's runtime and Story 1.16's authored evaluation. Shared planning, changelog, evidence and test-chain files require reconciliation with current `main` at merge.
