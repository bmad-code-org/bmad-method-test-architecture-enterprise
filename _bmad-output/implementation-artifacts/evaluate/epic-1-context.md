# Epic 1 Context: The Evaluate authoring loop

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 builds the authoring loop: given a description of an adopter's target, Evaluate identifies its kind, captures the behavior to measure, designs a probe corpus, authors a compiling Behavioral Evaluation Contract, wires the adapter the target needs, scaffolds a controlled mutation with a proved rollback, and drives eval-quality's compile, seal, preflight and score stages end to end. The clean arm must resolve `passed-clean-control` and the mutated arm must resolve `caught`, with any weaker verdict traced to a specific missing probe, control, or oracle. This removes the effort TeA already paid by hand for its ten existing skills, and the epic closes by running Evaluate on `bmad-testarch-evaluate` itself, so the authoring loop is proven on a real target before anything else depends on it.

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
- Story 1.10: Evaluate a stdio MCP tool server
- Story 1.11: Scaffold the HTTP probe port for `api` targets
- Story 1.12: Inspect the target, capture requirements and design the corpus
- Story 1.13: Author the contract, oracles, rubrics and adapter wiring
- Story 1.14: Drive the run and interpret the gaps
- Story 1.15: Float the engine pin and admit Evaluate-authored suites
- Story 1.16: Evaluate authors its own suite, run live and recorded

## Requirements & Constraints

- Identify the target kind (agent, skill, workflow, tool-use system, AI feature), map it to interface kind (`cli`, `api`, `mcp`) and adapter shape, asking when ambiguous. A web application always maps to `api`; no contract ever declares kind `web`.
- Capture the behavioral requirements inspection alone cannot infer, as a written statement the adopter confirms before corpus design starts.
- Design a probe corpus with at least one clean `zero-action` control, one seeded-defect probe per behavior (or refused with a reason), a `zero-action` defect probe per mandatory-action behavior, and a gameability probe per rubric- or judgment-governed behavior, plus its layout and digest.
- Author the contract with its identity and lineage fields stamped; compile must exit 0, every behavior must carry a non-null observable success criterion, declare exactly one designated oracle, and get a compiling rubric wherever judgment needs an anchored scale.
- Scaffold the runner command, MCP wiring, or HTTP port and register it in an execution-target registry, so a real observation reaches preflight with no authorization denial.
- Apply and roll back each controlled mutation with baseline-pass and mutated-fail evidence and a rollback actually performed and verified; a historical-route probe carries fail-before/pass-after evidence; a refused probe carries its reason; every admitted manifestation witness resolves cleanly at preflight.
- Generate a scoring policy, evaluator configuration, and isolation manifest valid against the engine's schemas, with every threshold set explicitly by the adopter; run the clean and mutated arms, seal the run records, and drive compile, seal, preflight, and score end to end.
- For a CONCERNS, FAIL, or Invalid result, name the unsatisfied rule, failed check, or missing evidence, and propose the probe, control, or oracle that closes it.
- The measurement engine is fixed, performs no mutation, and executes no target; TeA's own runtime does both and keeps no copy of the engine's compile, seal, preflight, scoring, or strength logic. Only `cli`, `api`, and `mcp` interface kinds are ever emitted. A defect signature addresses only an exit code or a descriptor-nominated stream or response body, never a file the target wrote. Versions float; nothing is ever pinned to an older release.
- The system under test is always the adopter's own use of a vendor dependency; the underlying model is a fixed condition of every run, never itself evaluated. No third-party individuals or employer-internal systems are named in generated content.

## Technical Decisions

- One skill, `bmad-testarch-evaluate`, menu code `EV`, built in TEA's lean shape only: `SKILL.md`, `references/` stage guides, `assets/` templates, `customize.toml`. No `workflow.yaml`, `steps-c/e/v`, or skill-local `scripts/`; deterministic work lives in the runtime, not the skill.
- Target kind lives only in `evaluation.json`, never in a schema field, and fixes the adapter: skill and agent map to `cli` through one generic command-line adapter (vendor knowledge isolated to a single adapters module); a tool server maps to `mcp`; an AI feature or web application maps to `api` through an adopter-owned HTTP probe port that delegates every address decision to the engine's own exported policy evaluator.
- `tea-evaluate` is the single driver: one CommonJS CLI (`check`, `digest`, `preflight`, `run`, `score`, `compare`, `ci`) reaching the ESM-only engine through one async loader, reading no `_bmad/` config. Every subcommand takes `--evaluation <path>` and exits 64 when none resolves. The engine is an optional peer dependency so it never lands in a project that doesn't run Evaluate.
- The engine's CLI, never its library, decides every enforced verdict; the runtime only plans and drives preflight legs through a recording port, routing the leg named by a defect's manifestation witness to the mutated (or pre-fix) copy and every other leg to the pristine copy.
- Run records share one shape (`invocationId`/`runId`/`trialIndex`/`conditionArm`), with one isolation manifest per trial set and per-registry infrastructure exit codes, so an infrastructure failure never reads as a quality score.
- Mutation happens only in a disposable copy (a detached git worktree, or a temp copy for a non-git or uncommitted target), through a fixed plant, observe, restore, verify cycle; `rollbackVerified: true` is set only once the restore is proved, and the adopter's working tree is never touched.
- An evaluation folder holds `corpus/`, `probes/`, `mutations/`, indexed and digested by `corpus-index.json`; committed probes hold only authored fields, and the runtime writes qualified, evidence-bearing probes separately. Versions float everywhere; nothing is pinned to an older engine release. TeA's ten existing generator-owned suites coexist unchanged, and no suite carries both a generated and an Evaluate-authored corpus.
- The skill is authored only through `bmad-workflow-builder`, run headless on its explicit path, gated by zero critical or high Analyze findings; a registration change also needs `bmad-module-builder` Validate Module on a staged layout; `bmad-build` owns the story lifecycle end to end, and the builder never commits or edits outside the skill directory.
- Each evaluation runs from its own generated, private `package.json`, never the adopter's root manifest. The epic's own proof run needs no CI secret; it runs through the local Claude Code CLI on the maintainer's machine.

## Cross-Story Dependencies

Stories 1.1 through 1.8 run strictly in order: 1.1 exports eval-quality's target-policy evaluation, released as eval-quality 4.0.0, and every story from 1.2 onward runs on that published engine. From 1.8, three stories branch before rejoining: 1.9 (gameability, historical, rubric probes), 1.10 (MCP target), and 1.11 (HTTP `api` target, which also needs 1.1's export directly). 1.12 depends only on 1.4. 1.13 needs 1.10, 1.11, and 1.12 together, since it wires every adapter kind and the corpus into one compiling contract. 1.14 needs 1.9 and 1.13; 1.15 and 1.16 close the epic in sequence. Epic 2's CI wiring depends on this epic's runtime and on the evaluation Story 1.16 authors.
