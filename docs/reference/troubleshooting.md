---
title: Troubleshooting Guide
description: Diagnose and resolve common issues when using TEA
---

# Troubleshooting Guide

## Installation Issues

### TEA Module Not Found After Installation

**Symptom**: after `npx bmad-method install`, the TEA agent is not available.

**Cause**: TEA was not selected at the module prompt, or the install failed silently and `_bmad/tea/` was never created.

```bash
ls -la _bmad/tea/                 # should show agents/, workflows/, config.yaml
npx bmad-method install           # select "Test Architect (TEA)" at the module prompt
npx bmad-method install --debug   # if it fails again, this surfaces the installer error
```

### Module Installation Hangs

**Symptom**: the installer hangs or times out.

**Cause**: network connectivity, an npm registry timeout, or no disk space.

```bash
ping registry.npmjs.org
df -h                                              # installs need room for the module tree
npm cache clean --force && npx bmad-method install # retry on a clean cache
npm config set registry https://registry.npmjs.org/ # if a proxy rewrote the registry
```

### Installer Cannot Reach GitHub

The installer starts but cannot fetch the Test Architect module. See [Install TEA Behind a Corporate Firewall](/how-to/install-behind-firewall/).

## Agent Loading Issues

### "Agent Not Found" Error

**Symptom**: `Error: Agent '_bmad/tea' not found` or `Agent 'tea' could not be loaded`.

**Cause**: TEA is not installed, or the install is incomplete.

```bash
ls -la _bmad/tea/agents/bmad-tea/SKILL.md   # the agent entrypoint
```

If the file is missing or the tree looks partial, [reset TEA to a fresh state](#reset-tea-to-a-fresh-state).

### TEA Loads But Commands Don't Work

**Symptom**: the TEA agent loads, but workflow codes (TF, TD, AT, and the rest) do not execute.

**Cause**: workflow directories are missing from the install.

```bash
ls _bmad/tea/workflows/testarch/   # all nine must be present
# bmad-teach-me-testing   bmad-testarch-framework   bmad-testarch-test-design
# bmad-testarch-atdd      bmad-testarch-nfr         bmad-testarch-test-review
# bmad-testarch-automate  bmad-testarch-ci          bmad-testarch-trace
```

Then invoke the workflow by its skill name instead of the two-letter code:

```text
/bmad-testarch-test-design    # Claude Code, Cursor, Windsurf
$bmad-testarch-test-design    # Codex
```

If a directory is missing, [reset TEA to a fresh state](#reset-tea-to-a-fresh-state).

### Custom TEA Workflow Does Not Appear

**Symptom**: a custom workflow that used to appear in the `bmad-tea` menu is gone after an update.

**Cause**: TEA is a standalone module. Custom workflows are not merged into TEA core automatically.

**Fix**: package the workflow as custom content or a custom module, attach it to `bmad-tea` through the generated customization file under `_bmad/_config/agents/`, then re-run `npx bmad-method install` so the customization and workflow registration are refreshed. See [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

## Workflow Execution Issues

### GitHub Copilot Slash Command Fails with "No such file or directory"

**Symptom**: a workflow launched through GitHub Copilot in VS Code fails with an error such as `can't open file 'C:\path\to\workspace\scripts\resolve_customization.py': [Errno 2] No such file or directory`.

**Cause**: GitHub Copilot runs skill commands from the workspace root rather than from the installed skill folder under `.github/skills/`, so a path written relative to the skill does not resolve.

**Fix**: shipped TEA workflows already anchor every path with `{skill-root}` or `{project-root}`. If you hit this in a workflow you wrote, apply the same anchoring; see [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

### Workflow Starts But Produces No Output

**Symptom**: the workflow runs but generates no test designs, reports, or tests.

**Cause**: the output directory is missing or not writable, `test_artifacts` is misconfigured, or the run stopped before its output step.

```bash
grep test_artifacts _bmad/tea/config.yaml   # default: _bmad-output/test-artifacts
mkdir -p _bmad-output/test-artifacts
chmod -R u+w _bmad-output/test-artifacts
```

If the directory is correct and writable, read the agent's final message for a completion line such as `✓ Test design complete`. When a run stops early, the last step it names is where to look.

### Subagent Fails to Execute

**Symptom**: the workflow reports a subagent failure, for example "API test generation subagent failed".

**Cause**: a subagent step file is missing, `/tmp` is not writable, the subagent returned an unparseable payload, or the runtime cannot launch parallel workers.

```bash
# 1. The subagent step files must exist
ls _bmad/tea/workflows/testarch/bmad-testarch-automate/steps-c/step-03*.md
# step-03-generate-tests.md plus step-03a-*, step-03b-*, step-03c-aggregate.md

# 2. Workers hand off through one JSON file per suite in /tmp
ls /tmp | grep '^tea-'
# e.g. tea-automate-api-tests-1763049600.json, tea-automate-e2e-tests-1763049600.json

# 3. Check which orchestration mode was selected
grep -E "tea_execution_mode|tea_capability_probe" _bmad/tea/config.yaml
```

If the runtime cannot launch parallel workers, force the deterministic path in `_bmad/tea/config.yaml`:

```yaml
tea_execution_mode: 'sequential'
tea_capability_probe: true
```

### Knowledge Fragments Not Loading

**Symptom**: the workflow runs but never references knowledge base patterns such as `test-quality` or `network-first`.

**Cause**: `tea-index.csv` is missing or truncated, or fragment files are missing.

```bash
wc -l < _bmad/tea/agents/bmad-tea/resources/tea-index.csv   # 55 (header + 54 fragments)
ls _bmad/tea/agents/bmad-tea/resources/knowledge/*.md | wc -l   # 54
head -1 _bmad/tea/agents/bmad-tea/resources/tea-index.csv
# id,name,description,tags,tier,fragment_file

# Workflows load knowledge through a `knowledgeIndex` key in step-file frontmatter,
# so workflow.yaml never mentions fragments
grep -r knowledgeIndex _bmad/tea/workflows/testarch/bmad-testarch-test-design/steps-c/
# knowledgeIndex: './resources/tea-index.csv'
```

## Configuration Issues

### Variables Not Prompting During Installation

**Symptom**: installation completes without asking for TEA configuration (`test_artifacts`, Playwright Utils, and the rest).

**Cause**: the installer ran with `-y`/`--yes`, which accepts defaults and skips prompts.

```bash
npx bmad-method install                    # prompting is the default; omit --yes
npx bmad-method install --list-options tea # every key and its allowed values
npx bmad-method install --set tea.test_artifacts=_bmad-output/test-artifacts
vi _bmad/tea/config.yaml                   # or edit the installed values directly
```

### Config Values Ignored

**Symptom**: TEA uses defaults instead of the values in `config.yaml`, or keeps using old values after you edited the file.

**Cause**: the file is in the wrong place, the YAML does not parse, a key is misspelled, or the chat started before the edit. TEA reads config once at workflow start and does not reload mid-chat.

```bash
ls -la _bmad/tea/config.yaml              # must be at the project root, under _bmad/tea/
npx --yes js-yaml _bmad/tea/config.yaml   # prints the parsed object, or the syntax error
```

If it parses and the key name matches [Configuration](/reference/configuration/), save the file, start a fresh chat, and re-run the workflow.

### Playwright Utils Integration Not Working

**Symptom**: workflows produce no Playwright Utils references even though `tea_use_playwright_utils` is enabled.

```bash
grep tea_use_playwright_utils _bmad/tea/config.yaml   # should show: true
grep -ic playwright-utils _bmad/tea/agents/bmad-tea/resources/tea-index.csv   # 18
```

Confirm the workflow integrates Playwright Utils at all. Framework (TF), Test Design (TD), ATDD (AT), Automate (TA), and Test Review (RV) do. CI, Trace, and NFR Evidence Audit do not.

## Output and File Issues

### Test Files Generated in Wrong Location

**Symptom**: test files are created in an unexpected directory.

**Cause**: `test_artifacts` resolves against the project root, so a misconfigured value or a shell sitting in a subdirectory moves the target.

```bash
grep test_artifacts _bmad/tea/config.yaml   # default: _bmad-output/test-artifacts
                                            # edit config.yaml to change it
pwd                                         # must be the project root
```

### Generated Tests Have Syntax Errors

**Symptom**: TEA generates tests with JavaScript or TypeScript syntax errors.

**Cause**: a framework mismatch, usually Playwright syntax emitted for a Cypress project or the reverse.

**Fix**: name the framework and language explicitly in the prompt, for example "Generate Playwright tests using TypeScript", then lint what came back:

```bash
npx eslint tests/**/*.spec.ts
```

### File Permission Errors

**Symptom**: `EACCES: permission denied` when writing files.

**Cause**: the target directory is not writable, is owned by another user, or the disk is full.

```bash
ls -la _bmad-output/test-artifacts
chmod -R u+w _bmad-output/test-artifacts
df -h
```

## Integration Issues

### Playwright Utils Not Found

**Symptom**: tests reference Playwright Utils but the imports fail.

```bash
npm install @seontechnologies/playwright-utils
npm ls @seontechnologies/playwright-utils   # confirms the resolved version
```

Generated tests import each fixture from its own module subpath, and `expect` from Playwright:

```typescript
import { expect } from '@playwright/test';
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
```

### Browser Automation Not Working

**Symptom**: `tea_browser_automation` is set to `auto`, `cli`, or `mcp`, but outputs contain no browser features.

**Cause**: for `cli` or `auto`, the CLI is not installed globally. For `mcp` or `auto`, the MCP server is not configured in the IDE.

```bash
playwright-cli --version                          # cli mode; install: npm i -g @playwright/cli@latest
npx playwright install                            # both modes need the browser binaries
npx @playwright/mcp@latest --version              # mcp mode; confirms the server is reachable
grep tea_browser_automation _bmad/tea/config.yaml # confirm the mode you think you set
```

For MCP mode, add the server to your tool's MCP config, then restart the IDE:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

See [Configure Browser Automation: MCP Setup](/docs/how-to/customization/configure-browser-automation.md#for-mcp-mcp-or-auto-mode) for the exact config file path for your tool (Claude Code, Codex, Gemini CLI, Cursor, Windsurf).

## Performance Issues

### Workflows Taking Too Long

**Symptom**: a workflow runs for several minutes without completing.

**Cause**: a large codebase to explore, many test files to review, or subagent overhead.

**Fix**: scope the run to a directory instead of the whole suite, for example "Review tests in tests/e2e/checkout/" rather than "review all tests". Use `automate` for targeted generation and `test-review` on specific files. Check `top` for CPU and memory pressure.

The first workflow run in a session loads knowledge fragments from disk and is slower than later runs. That is expected.

## Getting Help

### Reset TEA to a Fresh State

This clears a partial or corrupted install and is the fallback for every "missing file" symptom above.

```bash
cp _bmad/tea/config.yaml /tmp/tea-config-backup.yaml   # back up your answers first
rm -rf _bmad/tea/
npx bmad-method install                                # select "Test Architect (TEA)"
cp /tmp/tea-config-backup.yaml _bmad/tea/config.yaml   # only if the prompts lost a value
```

### Collecting Diagnostic Information

Include all of this when reporting an issue, plus the full error message and the exact commands that trigger it:

```bash
npx bmad-method status                                # BMAD and module versions
grep -A6 'test-architecture' _bmad/_config/manifest.yaml   # TEA channel and sha
node --version
uname -a
tree -L 2 _bmad/tea/
```

### Support Channels

- **Documentation**: [TEA documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/)
- **Bug reports**: [Open an issue](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=issue.md)
- **Questions**: [search existing issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) before filing a new one
