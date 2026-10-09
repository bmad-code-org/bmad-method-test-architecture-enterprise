# Setup Phase Completion

Apply at every Create, Edit, and Validate terminal after loading `resources/setup-state.md`. Keep `{skill-root}` canonical. If a phase step was invoked directly, initialize its all-scope journal and recover any applicable ledger before hooks; its containing directory identifies the default phase.

## 1. Validate Before Completing

Both-mode workers stop before terminal validation, report generated files and their Create checkpoint, and set the phase state to `generated`. The coordinator joins workers and integrates outputs before terminal validation. Workers execute no completion hooks.

Run the actual test commands from the frozen contract with its required services/toolchain. Framework scope validates its selected framework checklist, configuration, fixtures, scripts/docs and write-time hook integrity. Framework-only completion skips pipeline/platform comparisons and CI requirements.

When scope includes CI, validate the selected platform syntax, injection rules and CI checklist. Compare actual pipeline install commands, package manager/lockfile, configs, local/CI test commands, test directories, service startup/readiness, reporters/artifact paths and Pact jobs against the actual framework and immutable contract. CI-only uses the complete contract recorded from existing framework preflight. Both scope applies both phase checklists and combined consistency checks after generation joins.

Failed tests or inconsistent outputs keep the journal in progress and the affected phase incomplete. Record and repair failures before rerunning validation. Missing execution prerequisites remain blocked validation until commands pass. Validate updates its owned reserved report and criterion results in the journal. Edit validates its changed outputs before completing. A reused framework retains its existing Create checkpoint. Edit/Validate results and hook failures never mutate historical Create checkpoints.

## 2. Phase Handoff and CI Hook

After validation succeeds, journal `phase-handoff` before the applicable phase hook. CI uses the resolved `ci_workflow.on_complete`; an installed alias may resolve it with `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {ci-skill-root} --project-root {project-root} --key workflow.on_complete`. Missing alias/resolver failure uses the canonical-owned defaults plus already merged legacy overrides. Empty hooks record a skipped result.

Execute the CI hook with key `ci.on_complete` through `setup-state.md` section 3: save its exact instruction and started marker before execution, skip completed entries, halt on uncertain started entries, and save completion only after success. Preserve canonical `workflow.on_complete` separately; it is the final run hook. A failed phase hook leaves this operation's journal in progress. Create can mirror its hook state to its own phase checkpoint; Edit/Validate preserve old Create checkpoint contents.

Record the phase completed after its validation and phase hook succeed. Route a pending phase under the saved original operation. Framework Create activates CI and loads `{skill-root}/ci/steps-c/step-01-preflight.md` for pending generation, or `{skill-root}/ci/steps-c/step-04-validate-and-summary.md` when the joined worker already generated CI. Edit/Validate continue their saved per-phase targets/positions. Completed framework with pending CI reaches CI without replaying framework generation or hooks.

## 3. Canonical Completion

After every requested phase passes, journal `canonical-completion`, then resolve canonical `workflow.on_complete` with `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`. Resolver failure uses the separately saved canonical settings; skip an empty hook. Execute key `framework.on_complete` once using the same durable started/completed protocol. CI-only executes its legacy CI hook followed by canonical completion; both reaches canonical completion after CI succeeds.

Save journal `workflowStatus: completed` only after successful phase validation and required hooks. Preserve original phase checkpoints and per-phase reports. Summarize requested phases and actual test execution evidence in one report. Any hook failure leaves the operation journal in progress at its exact completion position. A resumed Edit/Validate finishes those hooks through its journal without entering Create resume or changing an old Create checkpoint's status.
