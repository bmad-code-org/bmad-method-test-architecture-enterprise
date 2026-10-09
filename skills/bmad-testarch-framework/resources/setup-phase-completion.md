# Setup Phase Completion

Apply at every Create, Edit, and Validate terminal after loading `resources/setup-state.md`. Keep `{skill-root}` canonical. If a phase step was invoked directly, initialize its all-scope journal and recover any applicable ledger before hooks; its containing directory identifies the default phase.

## 1. Complete the Saved Operation

Both-mode Create workers stop before terminal validation, report generated files and their Create checkpoint, and set the phase state to `generated`. The coordinator joins workers and integrates outputs before terminal validation. Workers execute no completion hooks. Resume completes unfinished framework generation before any CI terminal validation.

### Create

Run the actual test commands from the frozen contract with its required services/toolchain. Framework scope validates its selected framework checklist, configuration, fixtures, scripts/docs and write-time hook integrity. Framework-only completion skips pipeline/platform comparisons and CI requirements. A reused framework is checked through CI preflight's existing commands; skip scaffold checklist and write-time hook checks and retain its existing Create checkpoint.

When scope includes CI, validate the selected platform syntax, injection rules and applicable CI checklist. Browser/device criteria follow the contract's observed `test_surfaces` and frameworks; application stack alone never requires browser/device installs, caches or jobs. Compare actual pipeline install commands, package manager/lockfile, configs, local/CI test commands, test directories, service startup/readiness, reporters/artifact paths and Pact jobs against the actual framework and immutable contract. CI-only and both with a reused framework use the contract recorded in CI preflight. Both with a newly generated framework applies both phase checklists and combined consistency checks after generation joins.

Failed tests, unavailable execution prerequisites or inconsistent generated outputs keep Create in progress and the affected phase incomplete. Record failures and repair within the authorized setup scope before rerunning validation. Repairs requiring unrelated project changes need a separate user decision.

### Validate

Evaluate every criterion applicable to the selected artifacts and write PASS/WARN/FAIL, including execution results or unavailable services/dependencies. An unavailable command or service is a recorded result with its reason. Never repair outputs, install missing dependencies, or change tests during Validate. Complete the owned reserved report even when criteria fail; the report's FAIL verdict describes artifact quality and does not keep the validation operation in progress. Save criteria/results and the final report in the journal. An interrupted report write or failed hook remains resumable.

### Edit

Re-check only the changed outputs and their direct dependencies. A pipeline edit checks syntax, injection safety and evaluation-plan rendering/gates when applicable. A framework edit checks the changed config, fixture or script and runs affected tests when necessary. Record unrelated failures as observations; do not repair them or require the full project suite to pass. An unresolved defect introduced by the requested edit keeps Edit in progress. Missing unrelated execution prerequisites do not block completion of a valid pipeline edit.

Edit/Validate results and hook failures never mutate historical Create checkpoints. The coordinator records the operation's checks and next position before handoff.

## 2. Phase Handoff and CI Hook

After the operation's completion criteria are satisfied, journal `phase-handoff` before the applicable phase hook. CI uses the resolved `ci_workflow.on_complete`; an installed alias may resolve it with `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {ci-skill-root} --project-root {project-root} --key workflow.on_complete`. Missing alias/resolver failure uses the canonical-owned defaults plus already merged legacy overrides. Empty hooks record a skipped result.

Execute the CI hook with key `ci.on_complete` through `setup-state.md` section 3: save its exact instruction and started marker before execution, skip completed entries, halt on uncertain started entries, and save completion only after success. A failed phase hook leaves this operation's journal in progress. Create can mirror its hook state to its own phase checkpoint; Edit/Validate preserve old Create checkpoint contents.

Record the phase completed after its operation-specific checks and phase hook succeed. Route a pending phase under the saved original operation. Framework Create loads `{skill-root}/ci/steps-c/step-01-preflight.md` for pending generation, or `{skill-root}/ci/steps-c/step-04-validate-and-summary.md` when the joined worker already generated CI. Activation hooks do not replay at this handoff. Edit/Validate continue their saved per-phase targets/positions. Completed framework with pending CI reaches CI without replaying framework generation or hooks.

## 3. Run Completion

After every requested phase completes, journal `canonical-completion`. Only when scope includes framework, resolve canonical `workflow.on_complete` with `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`. Resolver failure uses the separately saved canonical settings; skip an empty hook. Execute key `framework.on_complete` once using the same durable started/completed protocol. CI-only completes after its CI hook; it never executes framework completion. Both reaches framework completion after CI succeeds.

Save journal `workflowStatus: completed` after the saved operation's criteria and required hooks finish. Preserve original phase checkpoints and per-phase reports. Summarize requested phases and actual checks or execution evidence. If `ci_scope_defaulted = true`, state that the unattended run included framework only and CI was not included. Any hook failure leaves the operation journal in progress at its exact completion position. A resumed Edit/Validate finishes those hooks through its journal without entering Create resume or changing an old Create checkpoint's status.
