---
run_id: 'example-20261009-backend-setup'
recovery_decision: 'fresh'
workflowStatus: 'in-progress'
setup_scope: 'both'
setup_operation: 'create'
setup_entry: 'bmad-testarch-framework'
ci_scope_answered: true
ci_scope_defaulted: false
framework_first_accepted: false
framework_reused: false
ci_platform: 'github-actions'
pipeline_action: 'create'
pipeline_target: '.github/workflows/test.yml'
active_phase: 'ci'
setup_parallel_started: true
parallel_workers:
  framework:
    run_id: 'example-20261009-backend-setup'
    role: 'framework'
    status: 'completed'
    position: 'phase-handoff'
  ci:
    run_id: 'example-20261009-backend-setup'
    role: 'ci'
    status: 'pending'
    position:
      file: '{skill-root}/ci/steps-c/step-01-preflight.md'
      subsection: '1'
phase_status:
  framework: 'completed'
  ci: 'pending'
phase_position:
  framework: 'phase-handoff'
  ci:
    file: '{skill-root}/ci/steps-c/step-01-preflight.md'
    subsection: '1'
phase_targets:
  framework: ['pyproject.toml', 'tests/']
  ci: ['.github/workflows/test.yml']
validation_reports: {}
edit_requests: {}
edit_applied: {}
phase_checkpoints:
  framework: '{test_artifacts}/framework/framework-setup-progress.md'
  ci: '{test_artifacts}/ci/ci-pipeline-progress.md'
contract:
  stack: 'backend'
  language: 'python'
  frameworks: ['pytest']
  toolchain: 'Python 3.12'
  package_manager: 'pip'
  lockfile: 'requirements-dev.txt'
  install_commands: ['python -m pip install -r requirements-dev.txt']
  config_paths: ['pyproject.toml']
  test_dir: 'tests'
  test_commands: ['python -m pytest']
  ci_test_commands: ['python -m pytest --junitxml=test-results/junit.xml']
  service_commands: []
  artifact_paths: ['test-results/']
  ci_platform: 'github-actions'
  pipeline_action: 'create'
  pipeline_target: '.github/workflows/test.yml'
  test_surfaces: ['unit', 'integration']
  dependency_decisions:
    playwright_utils: 'disabled'
    pactjs_utils: 'disabled'
  integration_flags:
    tea_use_playwright_utils: false
    tea_use_pactjs_utils: false
  pact_relevant: false
activation_completed: ['framework']
hooks_started: []
hooks_completed: []
hook_instructions: {}
lastSaved: '2026-10-09T18:00:00Z'
---

# Shared Setup Progress

Every scope and operation uses this durable journal; this example records a both Create run with a completed framework phase and pending CI phase. Resume verifies the framework's existing artifacts and continues at CI preflight without repeating framework generation or completion hooks.

When this Create run is archived, the coordinator preserves this journal's exact bytes and its same-run checkpoints in an immutable `setup-run-progress-{archive_id}.checkpoints/` directory. The adjacent `.checkpoints.json` sidecar records original phase paths, snapshot digests and the journal digest. Resume verifies that bundle, archives displaced history, and restores the original checkpoint bytes before dispatch. Pending phases without a saved checkpoint have an explicit absence record.
