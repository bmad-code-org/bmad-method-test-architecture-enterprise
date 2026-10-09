---
run_id: 'example-20261009-backend-setup'
recovery_decision: 'fresh'
workflowStatus: 'in-progress'
setup_scope: 'both'
setup_operation: 'create'
setup_entry: 'bmad-testarch-framework'
ci_scope_answered: true
framework_first_accepted: false
framework_reused: false
active_phase: 'ci'
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
