---
name: bmad-testarch-test-design
description: 'Create system-level or epic-level test plans. Use when the user says "lets design test plan" or "I want to create test strategy"'
---

## Conventions

- `{skill-root}` resolves to this workflow skill's installed directory.
- `{project-root}` resolves to the repository working directory.

## On Activation

Read `{skill-root}/workflow.md` and follow it exactly.

When `workflow.md`, step files, templates, or checklists reference sibling files with relative paths such as `steps-c/...`, `./instructions.md`, or `templates/...`, resolve them from `{skill-root}`, not from the workspace root.
