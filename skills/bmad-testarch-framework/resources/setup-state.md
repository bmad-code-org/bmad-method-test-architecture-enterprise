# Durable Setup State

Load this resource before activation and apply it to framework, CI, and both scope in Create, Edit, and Validate. Resume continues the saved operation. The coordinator is the only writer of `{test_artifacts}/framework/setup-run-progress.md`, the run journal. Existing framework and CI Create checkpoint paths remain unchanged.

## 1. Recover the Applicable Run Before Activation

Read the journal and the current/legacy framework and CI phase checkpoints without writing. Resolve `test_artifacts` using the canonical activation's config merge. Preserve unknown frontmatter and use existing legacy status inference. A phase checkpoint with `hooks_started` entries absent from `hooks_completed` is unfinished even if its artifact status says completed.

An applicable unfinished journal is one whose saved scope includes the request's phase and whose target paths match any caller-supplied Edit/Validate scope. An unfinished both journal can be resumed from either entry. Completed journals are history; they do not select scope, operation, or hooks for a new invocation. In particular, ignore stale completed both history when a newer CI phase is interrupted.

Compare applicable unfinished candidates by saved `lastSaved` in UTC (use filesystem modification time when an old timestamp cannot be ordered). A phase checkpoint with the journal's `run_id` belongs to that journal; merge its newer position/ledger into that same run. A newer standalone or legacy phase checkpoint belonging to a different run takes priority over an older journal. If unrelated unfinished candidates cannot be ordered or have different requested targets, list them and ask which to resume before activation. Do not merge separate run histories.

For a selected legacy phase checkpoint, recover its scope from its directory and its operation from `setup_operation` or `create` when absent. Load all saved `hooks_started`, `hooks_completed`, activation facts and contract fields before any activation hook. Preserve a recovered ledger while adopting the run into the journal. Its existing migration step still owns moving an in-progress legacy Create checkpoint; recovery never moves completed checkpoints.

On Resume, set `setup_resume_requested = true`, restore the selected run's original `setup_operation`, scope, contract, phase positions, targets, report reservations and hook ledger. If no unfinished run exists, report completed history or no progress and stop. Do not activate hooks for a nonexistent resumed run.

For a new C/E/V request with applicable unfinished progress, ask Resume or start over before hooks or project writes. Once the user chooses Resume, retain its saved operation and positions. Persist `recovery_decision` as `resume`, `start-over`, or `fresh` in the adopted/new journal; phase preflight consumes this decision without repeating its question. A start-over decision begins a distinct `run_id`; archive the previous journal intact as `setup-run-progress-{run_id}.md` before replacing the active journal. Apply existing Create checkpoint replacement rules in its owning phase. Preserve prior Edit/Validate reports and all phase checkpoints during Edit/Validate. Completed active journals are archived when the next authorized run begins.

## 2. Initialize the Journal Before Hooks

After scope consent, the missing-framework choice, valid TEA configuration, and recovery selection are settled, create or adopt the active journal before executing any custom activation hook. Use an opaque unique `run_id` and atomically replace saves through a temporary sibling file plus rename. A failed save stops execution before the corresponding hook, project write, or handoff. Restore loaded hook state; do not reset it on Resume.

Persist `run_id`, `recovery_decision`, `workflowStatus`, `setup_scope`, `setup_operation`, `setup_entry`, `ci_scope_answered`, `framework_first_accepted`, `framework_reused`, `active_phase`, `phase_status`, `phase_checkpoints`, `phase_position`, `phase_targets`, `validation_reports`, `edit_requests`, `edit_applied`, `contract`, `activation_completed`, `hooks_started`, `hooks_completed`, `hook_instructions`, and `lastSaved`. Only selected phases enter `phase_status`. Initialize their status to `pending`; valid positions use a phase step file and subsection or the named `phase-handoff`/`canonical-completion` position.

`phase_checkpoints` are references to existing Create progress paths. A Create save adds `run_id` and its contract/ledger fields while keeping original `stepsCompleted` names. Edit and Validate update this journal and their requested outputs/reports; their completion and hook failures never change an old Create checkpoint's `workflowStatus`, `lastStep`, or ledger. An explicitly requested edit to a checkpoint is a user artifact edit and preserves every unrequested field.

Before each step, save its current file/subsection as `phase_position`. After a successful subsection, save the next subsection. After a Create checkpoint save, save the next owning step as its journal position. An interrupted write is reconciled against the expected artifact before advancing. Workers write their own Create checkpoint and report positions to the coordinator; workers never write the shared journal.

## 3. Execute Every Hook Durably

Canonical and CI activation prepend/append entries each have their own stable ledger key: `framework.activation_steps_prepend.0`, `framework.activation_steps_append.0`, `ci.activation_steps_prepend.0`, `ci.activation_steps_append.0`, and so on. Completion keys remain `ci.on_complete` and `framework.on_complete`. Save the exact instruction for each key in `hook_instructions`; a changed instruction or reordered hook list during Resume requires resolving that changed entry before execution.

For every applicable hook, in order:

1. If the key is in `hooks_completed`, skip execution.
2. If the key is in `hooks_started` and has no completed marker, halt before further writes or hooks. Explain that the prior hook's outcome is uncertain and ask whether it finished. Only an explicit answer can mark it completed or authorize a retry; elapsed time and headless mode cannot answer. A retry is a recorded recovery decision.
3. Save the key and exact instruction in `hooks_started` before executing it. A save failure stops before execution.
4. Execute the hook. Save its key in `hooks_completed` only after success. On failure, leave the journal in progress with the failure and stop.

An empty completion hook requires no execution; record its skipped result. Persistent facts reload from the current resolved settings on every invocation. `activation_completed` summarizes a successfully processed phase activation; each individual hook ledger protects interruptions before that summary is saved. On Resume, canonical/CI settings may be resolved again, but completed custom hooks never repeat.

## 4. Operation-Specific Resume Positions

For Create, use the journal's saved next-step position when available. A legacy Create checkpoint with no journal position enters its owning phase's resume loader once, which computes the next step from its original `lastStep` table. A saved terminal artifact result with incomplete completion hooks resumes at `phase-handoff` or `canonical-completion`. A generated worker phase resumes directly at its terminal validator. Missing generated artifacts return to their owning creation step after repair is selected.

For Edit, persist each phase's confirmed exact targets, requested changes, evaluation-plan paths/digests, current step/subsection and completed edits. Save target pre-edit digests before writes and actual resulting digests after each applied change. After an interrupted edit, read the actual files and reconcile the requested change against the saved before state before reapplying. A fully applied change advances without rewriting it; an uncertain partial edit halts for the missing decision. Resume uses these saved targets and confirmed requests, skips completed edits, and continues at the saved edit subsection. It never enters a Create resume loader.

For Validate, save exact selected artifacts, `validation_scope`, `run_timestamp`, the reserved report path, reservation `run_id`, completed criteria/results and the current subsection. Journal the chosen report path before its exclusive-create reservation. After reservation succeeds, save that fact before further validation. If interrupted between those writes, recover the report only when its `run_id` proves this run owns it. Resume continues the same owned report and unfinished checks. It never reserves another report or truncates another run's report. If a saved reservation is missing or its ownership differs, stop and report the inconsistency.

Dispatch the saved next file/subsection directly for journal-backed Resume. This is a one-way dispatch: do not route back into a phase resume loader or call the shared router recursively. A completed framework checkpoint with pending CI continues to CI under the saved original operation; completed phases keep their checkpoints and hooks. A phase becomes completed after its validation and applicable phase hook succeed. Canonical completion is a distinct final journal position.
