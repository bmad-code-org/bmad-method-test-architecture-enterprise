---
name: bmad-testarch-trace
description: 'Generate traceability matrix and quality gate decision. Use when the user says "lets create traceability matrix" or "I want to analyze test coverage"'
---

## Conventions

- `{skill-root}` resolves to this workflow skill's installed directory.
- `{project-root}` resolves to the repository working directory.

## On Activation

Read `{skill-root}/workflow.md` and follow it exactly.

When `workflow.md`, step files, templates, or checklists reference sibling files with relative paths such as `steps-c/...`, `./instructions.md`, or `templates/...`, resolve them from `{skill-root}`, not from the workspace root.
