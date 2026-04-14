---
name: bmad-testarch-atdd
description: 'Generate red-phase acceptance test scaffolds using the TDD cycle. Use when the user says "lets write acceptance tests" or "I want to do ATDD"'
---

## Resolve Customization

Resolve `inject` and `additional_resources` from customization:
Run: `python ./scripts/resolve-customization.py bmad-testarch-atdd --key inject --key additional_resources`
Use the JSON output as resolved values.

If `inject.before` is not empty, incorporate its content as high-priority context.
If `additional_resources` is not empty, read each listed file and incorporate as reference context.

Follow the instructions in [workflow.md](workflow.md).

## Post-Workflow Customization

After the workflow completes, resolve `inject.after` from customization:
Run: `python ./scripts/resolve-customization.py bmad-testarch-atdd --key inject.after`

If resolved `inject.after` is not empty, incorporate its content as a final checklist or validation gate.
