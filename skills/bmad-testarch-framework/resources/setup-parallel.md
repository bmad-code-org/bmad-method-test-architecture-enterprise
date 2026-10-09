# Both-Mode Generation

Read the shared router first. Concurrent generation applies to both Create after framework preflight/selection has agreed the contract. Resolve execution mode using the scaffold step's existing user-first/config/runtime fallback rules. Sequential mode completes framework generation before CI generation; both modes use the same contract and final checks.

## 1. Freeze the Contract and File Ownership

Complete the scaffold's existing dependency consent and Pact relevance decisions before launch, then persist them with the contract. Activate legacy CI settings and resolve the effective platform before launching its worker. A worker may start from an agreed future config or script; it waits for combined validation to check the real files.

- Framework worker owns test configs, tests, fixtures, factories, helper sources, dependency manifests/lockfiles, environment examples, test scripts/docs and the write-time hook. It executes `steps-c/step-03-scaffold-framework.md` and `steps-c/step-04-docs-and-scripts.md` with `setup_worker = framework` and stops before `step-05-validate-and-summary.md`.
- CI worker owns the selected pipeline, CI scripts/docs, quality gates, evaluation-plan rendering, and its CI checkpoint. It executes `ci/steps-c/step-01-preflight.md` through `ci/steps-c/step-03b-render-evaluation-plans.md` with `setup_worker = ci` and stops before `ci/steps-c/step-04-validate-and-summary.md`.
- The coordinator owns the all-scope journal, final manifest/script integration, worker joins, validation and terminal hooks. Shared files have exactly one writer. A worker sends proposed changes to another owner's file through the coordinator.

Pact consumer CI remains included. When framework scaffolding plans its own `.github/workflows/contract-test-consumer.yml`, assign that file to the framework worker and have CI read its planned commands; CI's generated contract jobs must preserve the existing consumer workflow and its semantics. For overlap on a CI file, agree its single writer before launch and return the other worker's proposed contents for integration. Optional dependency choices already settled in the contract are not asked again by a worker.

## 2. Launch and Join

When the resolved mode supports subagents or an agent team, launch both workers concurrently, giving each the same journal `run_id`, immutable contract, original request, selected library mandates, scope/operation, platform, and ownership map. Set `setup_parallel_started = true` so a framework worker does not recursively launch this orchestration. Each worker can use its phase's existing internal orchestration when capacity permits; fallback remains deterministic.

CI preflight may accept the agreed future framework/config/dependencies and defer the local test execution check while `setup_worker = ci` in this both run. It still validates the git repository, platform, environment and contract. YAML generation can begin before framework files exist. Planned Pact artifacts qualify only for generation; final validation requires actual dependencies, scripts and tests on disk.

Join both workers. Inspect every result and record each generated phase checkpoint. If one fails, preserve the other worker's artifacts and checkpoint, leave the run in progress, and resume only the incomplete work. Reconcile any contract changes through the coordinator and update all affected generated files before validation.

## 3. Combined Validation

Integrate manifest/script proposals and resolve all ownership conflicts. Clear `setup_worker` and run framework terminal validation, then CI terminal validation, with both phases marked generated until their checks pass. Run the resulting tests and check pipeline consistency against the actual artifacts; planned paths never substitute for this final execution. Use `resources/setup-phase-completion.md` for phase hooks and one canonical completion.
