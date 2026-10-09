---
name: bmad-testarch-ci
description: 'Scaffold CI/CD quality pipeline with test execution. Use when the user says "lets setup CI pipeline" or "I want to create quality gates"'
---

# CI/CD Setup Compatibility Entry

`bmad-testarch-framework` owns framework and CI setup. This installed name and the CI menu code forward to its CI phase.

1. Preserve the original request, its supplied artifacts, and its create/resume/validate/edit operation. Preset `setup_scope = ci` and `setup_entry = bmad-testarch-ci`. An explicit request for both scopes sets `setup_scope = both`.
2. Set `ci-skill-root` to this directory. Set `skill-root` to its sibling `bmad-testarch-framework` directory. Require its `SKILL.md`, `{skill-root}/resources/setup-routing.md`, and `{skill-root}/ci/steps-c/step-01-preflight.md`. If any are missing, explain that the canonical framework skill is missing or older than combined setup support and offer to install/update it with `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise --skill bmad-testarch-framework`; continue only after installation succeeds and all three required files exist.
3. Load `{skill-root}/SKILL.md` completely and execute its activation and shared router with the preset scope and original operation. Keep `{skill-root}` bound to that canonical directory throughout all phases. Do not run a second mode menu or CI-scope question.

The canonical router resolves this entry's `customize.toml`, `_bmad/custom/bmad-testarch-ci.toml`, and `_bmad/custom/bmad-testarch-ci.user.toml` when the CI phase activates. It preserves legacy activation steps, persistent facts, `ci_platform`, and `on_complete` hooks. Existing CI checkpoint and validation-report paths remain under `{test_artifacts}/ci/`, including their legacy migration rules.
