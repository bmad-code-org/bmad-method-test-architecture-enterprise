# Test Generation Routing

Resolve the test mode before any customization hook, persistent fact, greeting, or project write.
`test_mode` is red or expand; `test_operation` is create, resume, validate or edit.
These are separate from the worker execution mode (`tea_execution_mode`) and the red phase's AI/recording selection.

## 1. Choose the Operation and Mode

Keep the original request and supplied files.
Use `bmad-tea-automate` as `test_entry`. Preserve a legacy `testEntry` value when resuming an existing checkpoint. An AT menu invocation presets red mode; a single explicit user mode overrides that preset.
Resolve explicit Create, Resume, Validate or Edit wording first.
A request to generate tests means Create.
In a headless or autonomous invocation, an unspecified operation defaults to Create without a menu.

Start with `test_mode_defaulted = false`.
A single explicit `red mode` or `expand mode` is authoritative.
Otherwise an AT menu invocation selects red. Acceptance tests before implementation, `write acceptance tests`, `acceptance test scaffolds`, ATDD, or the TDD red phase also selects red; coverage expansion, tests for existing code, or automation selects expand.
Treat the invoked command name as an entry default, separate from the user's task wording: mentioning `/bmad-tea-automate` in an acceptance-test request cannot count as an expand signal.
When no task mode signal is present, default to expand.
Ask once which mode to use only when explicit task mode signals conflict in an interactive run, including a request that names both `red mode` and `expand mode`.
A headless or autonomous run with conflicting signals defaults to expand without a question.
For a defaulted mode, set `test_mode_defaulted = true` and state the selected default in the final summary.
An explicit mode in the user's request overrides the default.

The following routing examples apply before customization activation:

| Invocation          | Task signal                 | Run mode                | Selected mode    | Mode question |
| ------------------- | --------------------------- | ----------------------- | ---------------- | ------------- |
| `bmad-tea-automate` | none                        | interactive             | expand (default) | no            |
| `bmad-tea-automate` | lets write acceptance tests | interactive or headless | red              | no            |
| `bmad-tea-automate` | acceptance test scaffolds   | interactive or headless | red              | no            |
| `bmad-tea-automate` | red and expand task signals | interactive             | unresolved       | ask once      |
| `bmad-tea-automate` | red and expand task signals | headless                | expand (default) | no            |
| `bmad-tea` AT menu  | none                        | interactive or headless | red              | no            |

For Resume with an exact checkpoint path, resolve it against the project root, verify that it exists and is readable, and retain it as `resume_checkpoint_path`. A missing supplied file stops before activation; do not search for a replacement. The checkpoint path itself is not a new target scope.
Infer the original mode from that supplied checkpoint's `testMode` or its owning artifact folder: `atdd/` is red and `automate/` is expand; legacy `atdd-checklist-*.md` is red and `automation-summary.md` is expand.
Use that original mode and original Create operation.
An explicitly conflicting mode cannot change an interrupted run; explain the conflict and stop before hooks or writes.
When no checkpoint path is supplied, select only within the resolved mode using its existing Resume loader.
The Resume loader must select `resume_checkpoint_path` directly, including a path outside the configured artifact folder. Keep the original scope identity check and legacy migration rules. After any required legacy migration, bind `outputFile` to the selected or migrated checkpoint so subsequent steps continue that exact run.
Do not restart Create or execute a completed generation step on an explicit Resume.

## 2. Choose Exactly One Customization Surface

Both modes resolve from this skill's own `customize.toml` and `_bmad/custom/bmad-tea-automate.toml` and `.user.toml`.
For red set `workflow-key = workflow.red`. For expand set `workflow-key = workflow`.
`workflow.red` holds the red settings (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`); expand never reads it and red never reads the top-level keys.
Resolve only the selected key, with `resolve_customization.py --skill {skill-root} --key {workflow-key}`, and retain the returned block for its terminal hook.

Run selected prepend hooks, load selected persistent facts, load config, greet, then run selected append hooks in that order.
The selected mode's `workflow.on_complete` executes at its original terminal after outputs are saved, including Validate and Edit.
Do not activate the other surface or run its completion hook.
Keep `{skill-root}` canonical when loading red steps, templates and knowledge.

## 3. Preserve Original Workflow Contracts

Red uses `{skill-root}/red/workflow.yaml`, instructions, checklist and templates; expand uses the corresponding canonical root files.
Preserve worker payloads, criterion registry, deterministic knowledge fragment selection, Pact and Playwright Utils mandates, `tea_execution_mode` and its capability gates.
Output and legacy checkpoint paths remain exactly as the selected mode defines them.
Persist `testMode` and `testEntry` on a new Create checkpoint, while retaining original `lastStep` and `stepsCompleted` values.
A 2.0.0 checkpoint without the new fields follows its owning mode's original resume mapping.
Do not require a new journal or contract before dispatching that saved next step.

For an autonomous Create, red's Confirm Inputs summarizes and continues without waiting; expand's context choice infers BMad-Integrated when artifacts exist and Standalone otherwise.
Preserve the existing headless start-over default when Create encounters unfinished same-scope progress; an explicit Resume always continues the selected progress.
For Edit or Validate, supplied exact artifact paths and edit instructions satisfy target/confirmation questions.
When a required target or red story is missing, stop with that missing input; never fabricate scope.
Only Create runs the shared run-and-heal resource after aggregation.
Report chosen mode, any default, actual execution, healed failures and remaining defects.
