---
name: bmad-testarch-automate
description: 'Expand test automation coverage for codebase. Use when user says "lets expand test coverage" or "I want to automate tests"'
---

## Conventions

- `{skill-root}` resolves to this workflow skill's installed directory.
- `{project-root}` resolves to the repository working directory.

## On Activation

Read `{skill-root}/workflow.md` and follow it exactly.

When `workflow.md`, step files, templates, or checklists reference sibling files with relative paths such as `steps-c/...`, `./instructions.md`, or `templates/...`, resolve them from `{skill-root}`, not from the workspace root.
