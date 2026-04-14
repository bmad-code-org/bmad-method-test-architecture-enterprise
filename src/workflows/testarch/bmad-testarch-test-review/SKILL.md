---
name: bmad-testarch-test-review
description: 'Review test quality using best practices validation. Use when user says "lets review tests" or "I want to evaluate test quality"'
---

## Resolve Customization

Resolve `inject` and `additional_resources` from customization:
Run: `python ./scripts/resolve-customization.py bmad-testarch-test-review --key inject --key additional_resources`
Use the JSON output as resolved values.

If `inject.before` is not empty, incorporate its content as high-priority context.
If `additional_resources` is not empty, read each listed file and incorporate as reference context.

Follow the instructions in [workflow.md](workflow.md).

## Post-Workflow Customization

After the workflow completes, resolve `inject.after` from customization:
Run: `python ./scripts/resolve-customization.py bmad-testarch-test-review --key inject.after`

If resolved `inject.after` is not empty, incorporate its content as a final checklist or validation gate.
