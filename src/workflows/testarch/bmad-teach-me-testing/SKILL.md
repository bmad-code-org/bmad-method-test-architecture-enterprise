---
name: bmad-teach-me-testing
description: 'Teach testing progressively through structured sessions. Use when user says "lets learn testing" or "I want to study test practices"'
---

## Conventions

- `{skill-root}` resolves to this workflow skill's installed directory.
- `{project-root}` resolves to the repository working directory.

## On Activation

Read `{skill-root}/workflow.md` and follow it exactly.

When `workflow.md`, step files, templates, or checklists reference sibling files with relative paths such as `steps-c/...`, `./instructions.md`, or `templates/...`, resolve them from `{skill-root}`, not from the workspace root.
