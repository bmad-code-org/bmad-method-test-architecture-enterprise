# Shared Setup Router

Read this resource and `{skill-root}/resources/setup-state.md` completely before activation. `{skill-root}` always names `bmad-testarch-framework`; `{ci-skill-root}` names its sibling `bmad-testarch-ci` when installed. Keep the original request and supplied artifact paths through every handoff.

## 1. Read-Only Request Gate: Before Activation

Resolve the requested operation independently of scope: `create` (C), `resume` (R), `validate` (V), or `edit` (E). Preserve an operation supplied by the caller, including Evaluate's CI edit/create request. When it is unclear, offer the existing C/R/V/E menu once.

Read effective config and all applicable run/phase history and execute `setup-state.md` section 1 before any activation hook. Resume restores its saved scope, original operation, targets, positions, contract and full hook ledger first. An unfinished both run entered through the CI alias retains both scope. A completed both journal never overrides a newer interrupted CI-only checkpoint. Preserve Resume as `setup_resume_requested`; `setup_operation` remains the original saved C/E/V operation. Select a new scope only after recovery determines this is a fresh run.

Resolve `setup_scope` as `framework`, `ci`, or `both`:

- Explicit scope and a supplied operation take priority. Requests mentioning framework and pipeline setup select `both`.
- A CI pipeline, quality gates, CI artifact target, or the CI entry/menu code presets `ci`.
- Framework-only wording or a supplied framework artifact selects `framework`.
- For setup requests whose CI intent remains unclear, ask exactly once: **“Do you want CI too?”** A yes selects `both`; a no selects `framework`. Record `ci_scope_answered = true`. Wait for the answer before any project writes, including custom activation hooks. An autonomous run waits for this scope answer too.

For CI Create without an existing framework, make a read-only inventory before any hook or checkpoint writes. Search root and configured test directories, scripts and their config paths, language manifests, and mobile test directories. A config can live under `tests/`; a Go suite needs test files. If the framework is missing, ask once: **“There is no test framework yet. Set it up now and continue CI in this run?”** Acceptance sets `setup_scope = both`, `framework_first_accepted = true`, and returns to framework selection before continuing CI. Declining stops the run and leaves the project untouched. This choice occurs before shared or CI checkpoints are created. An explicit request for both already authorizes framework setup. Resume uses its existing consent and saved current position.

For both Create with a framework already present, set `framework_reused = true`. Inventory its stack, package manager, commands and config paths; validate and reuse it. Preserve its files and checkpoint. Skip framework Create preflight's no-existing-framework conflict and continue CI under its actual existing contract.

Initialize or adopt the all-scope journal through `setup-state.md` section 2 after these choices and valid TEA configuration, before any custom hook executes. Preserve unfinished ledgers and histories.

## 2. Scope Activation and Settings

Canonical activation runs in SKILL.md after section 1; retain its results here without running it again. Each canonical prepend/append entry uses `setup-state.md` section 3's individual durable hook protocol. On Resume, resolve current settings and reload persistent facts; skip completed hook entries and halt on uncertain started entries. Maintain canonical `workflow` separately from `ci_workflow` throughout the run.

When scope includes CI, resolve its compatibility customization before its phase or worker begins:

1. Start with canonical-owned CI defaults: `ci_platform = auto`, empty `activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, and `on_complete`. These defaults make canonical CI functional when the alias directory is absent.
2. If `{ci-skill-root}/customize.toml` exists, resolve it through `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {ci-skill-root} --project-root {project-root} --key workflow`. If the alias is absent or the resolver fails, structurally merge the canonical-owned CI defaults, the legacy defaults when present, `_bmad/custom/bmad-testarch-ci.toml`, and `_bmad/custom/bmad-testarch-ci.user.toml`, skipping missing files. All legacy overrides, including migrated platform settings, remain effective even without the installed alias.
3. Store the result as `ci_workflow`. Execute its prepend entries through the per-entry durable ledger, load persistent facts/globs in lexical order, then execute its append entries through that ledger. Retain canonical role/config and greeting. Save `ci` in `activation_completed` after its entries succeed. Persistent facts reload on resumed invocations.
4. Framework steps use canonical `workflow`. CI steps read `ci_workflow` for their legacy hooks/facts and the effective platform below. Keep `{skill-root}` bound to the canonical directory for every CI asset.

**Platform precedence:** An explicit `workflow.ci_platform` in canonical team/user overrides wins, including explicit `auto`. Inspect those override files to distinguish it from the shipped default. Otherwise use `ci_workflow.ci_platform`, preserving migration-1.toml's destination. If neither is present, use `auto`. Bind the result to `{workflow.ci_platform}` during CI steps without replacing the saved canonical workflow object.

## 3. Shared State and Contract

All scopes and operations use `{test_artifacts}/framework/setup-run-progress.md` and the durable protocol in `setup-state.md`. The original per-phase Create checkpoint paths and `stepsCompleted` names remain unchanged:

- Framework: `{test_artifacts}/framework/framework-setup-progress.md`, with its root-level legacy path and migration rules.
- CI: `{test_artifacts}/ci/ci-pipeline-progress.md`, with its root-level legacy path and migration rules.

Use `resources/setup-run-progress.example.md` for the journal shape. Before every phase handoff and after each phase save, the coordinator atomically saves phase status, next position, contract and timestamp. Workers report their own checkpoint changes to the coordinator. `pending`, `in-progress`, `generated`, and `completed` have distinct meanings. Edit/Validate state, results and hook failures affect their journal; older Create checkpoints remain unchanged.

For every scope and operation, agree one immutable contract from the real project inventory before scaffold/pipeline generation or test execution: stack/language, frameworks for every surface, toolchain versions, package manager/lockfile, install commands, config/test directories, exact local and CI test commands, required services/startup/readiness commands, artifact paths, integration flags/dependencies and Pact relevance. Include selected platform only when CI is requested. For CI-only, build this contract from the existing framework scripts/configs and service documentation during preflight; an empty contract cannot proceed to generation. Framework-only builds it during selection; existing-framework Edit/Validate builds it from selected actual artifacts. Journal the complete contract, then freeze it for workers and validators. Any required correction is coordinated, recorded and applied to all affected outputs.

Resolve optional library installation choices from the existing scaffold step before launching workers. Record accepted dependencies and each declined library's fallback. Record Pact's relevance decision and planned config/script paths so parallel CI generation can consume future framework artifacts. The CI platform and commands come from the same contract throughout pipeline generation, helper scripts, local test execution and terminal validation; examples in phase steps are fallbacks, and never override established project commands.

## 4. Operation and Phase Routing

Use canonical SKILL.md's C/E/V routes for a fresh phase under its saved `setup_operation`. For both Create with `framework_reused = true`, validate the existing framework against its checklist and agreed test commands, mark its phase completed in the journal, retain its Create checkpoint, then route directly to CI Create preflight. A failing reused framework remains incomplete. New framework generation runs framework, then CI; both Create generation may overlap through `resources/setup-parallel.md` once selection fixes the contract.

For Resume, use `setup-state.md` section 4. A journal-backed run dispatches its saved operation-specific next file/subsection directly. Only a legacy Create checkpoint lacking that position uses the owning phase R loader once. A pending phase begins with its original C/E/V entry; a generated worker phase begins at terminal validation. Verify completed artifacts still exist; missing artifacts require owning-phase repair. A completed framework checkpoint with pending CI continues to CI. Completed phases and hooks never repeat, and resume dispatch never recurses back to this router.

Edit and Validate restore their per-phase targets, requested changes, reserved report paths, results and current positions from the journal. Pass caller-supplied targets to their matching phase. Every phase terminal loads `resources/setup-phase-completion.md` and returns to the coordinator for remaining phases or canonical completion.
