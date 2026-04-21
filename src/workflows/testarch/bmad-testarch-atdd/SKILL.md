---
name: bmad-testarch-atdd
description: 'Generate red-phase acceptance test scaffolds using the TDD cycle. Use when the user says "lets write acceptance tests" or "I want to do ATDD"'
---

## Conventions

- `{skill-root}` resolves to this workflow skill's installed directory.
- `{project-root}` resolves to the repository working directory.

## On Activation

Read `{skill-root}/workflow.md` and follow it exactly.

When `workflow.md`, step files, templates, or checklists reference sibling files with relative paths such as `steps-c/...`, `./instructions.md`, or `templates/...`, resolve them from `{skill-root}`, not from the workspace root.
