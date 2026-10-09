---
title: 'Extend TEA with Custom Workflows'
description: Add your own workflows to bmad-tea without patching TEA core
---

# Extend TEA with Custom Workflows

Install custom workflows as separate skills and add them to the TEA menu through agent customization.

## The Supported Model

1. Build the workflow as its own skill, outside TEA.
2. Install it into the project with `npx skills add`.
3. Add a menu entry to `bmad-tea` through agent customization.

## Recommended Approach

### 1. Create the workflow as a skill

Build a skill that lives outside TEA.
BMad Builder is the recommended path for creating reusable custom agents and workflows, and a workflow used across projects can ship as its own module.

See:

- [How to Customize BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/customize-bmad.md)
- [BMad Builder (BMB)](https://github.com/bmad-code-org/bmad-builder)

### 2. Install the skill

Add it to the project the same way TEA's skills are added:

```bash
npx skills add <your-repo-or-path>
```

### 3. Attach the workflow to `bmad-tea`

Add a menu item in `_bmad/custom/bmad-tea.toml` (team) or `_bmad/custom/bmad-tea.user.toml` (personal).
Entries are keyed by `code`: a new code is appended to Murat's menu, and an existing code replaces that item.

```toml
[[agent.menu]]
code = "MW"
description = "My custom TEA extension workflow"
skill = "my-custom-workflow"
```

The `bmad-customize` skill can write this file for you.
Start a fresh chat so `bmad-tea` picks up the new menu.

## What Not to Do

- Do not patch TEA core files directly if the workflow is project-specific.
- Do not rely on old embedded-TEA behavior where local workflows appeared to be attached automatically.
- Do not keep custom workflow logic only in chat instructions. Put it in a real workflow or module so it survives updates.

## Path-Safe Authoring for GitHub Copilot and Other Workspace-Root Runtimes

Some IDE skill runners, including GitHub Copilot slash commands in VS Code, execute commands from the workspace root.
Anchor package paths explicitly.

Author custom TEA skills and workflows with that constraint in mind:

- Use `{skill-root}` for files that live inside the installed skill package.
- Use `{project-root}` for files that live in the target repository.
- Do not assume `scripts/...`, `workflow.md`, `./instructions.md`, or `steps-c/...` will resolve relative to the current markdown file unless you explicitly anchor them.

Use patterns like these:

```md
Read `{skill-root}/workflow.md` and follow it exactly.
Load `{skill-root}/steps-c/step-01-preflight.md`.
Run: `uv run {skill-root}/scripts/resolve_customization.py --key inject`
Run: `uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key core --key modules.tea`
```

Avoid patterns like these:

```md
Read `workflow.md`
Load `steps-c/step-01-preflight.md`
Run: `uv run scripts/resolve_customization.py --key inject`
```

This keeps the same skill portable across Codex, Claude Code, GitHub Copilot, and other runtimes that install skills into different directories.

## When to Use Which Approach

- **Project-specific workflow**: install it as a skill and attach it to `bmad-tea`
- **Reusable internal workflow**: package it as a custom module
- **Reusable public workflow**: consider publishing a standalone BMAD module

## Related Docs

- [TEA Command Reference](/docs/reference/commands.md)
- [TEA Configuration Reference](/docs/reference/configuration.md)
- [How to Customize BMad](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/customize-bmad.md)
