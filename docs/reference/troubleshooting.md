---
title: Troubleshooting Guide
description: Diagnose and resolve common issues when using TEA
---

# Troubleshooting Guide

## Installation Issues

TEA installs as skills.
`npx skills add` copies each one into your host's skills folder, such as `.claude/skills/` or `.agents/skills/`.
The commands below use `.claude/skills/`; substitute your host's folder.

### TEA Skills Not Found After Installation

**Symptom**: After `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise`, the TEA agent or workflows are not available.

**Cause**: The install did not finish, it went to a different scope (project or global) than the one your host reads, or the host was started before the skills existed.

```bash
ls .claude/skills/ | grep -E 'bmad-tea|bmad-testarch|bmad-teach|bmod-tea'
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise   # re-run to add what is missing
```

Expect `bmad-tea`, `bmad-teach-me-testing`, nine `bmad-testarch-*` workflows, and `bmod-tea`.
Restart the host or start a fresh chat after installing.

### Install Hangs or Cannot Reach GitHub

**Symptom**: `npx skills add` hangs, times out, or cannot fetch the repository.

**Cause**: Network connectivity, an npm registry timeout, or a firewall that blocks GitHub.

```bash
ping registry.npmjs.org
npm cache clean --force                              # retry on a clean cache
npm config set registry https://registry.npmjs.org/  # if a proxy rewrote the registry
```

If GitHub itself is blocked, see [Install TEA Behind a Corporate Firewall](/how-to/install-behind-firewall/).

### TEA Says It Is Not Set Up

**Symptom**: A TEA skill stops and asks you to run `bmad setup tea`.

**Cause**: `_bmad/config.toml` is missing or has no `[modules.tea]` table.
The setup questions come from `bmad setup tea`.

**Fix**: Run `bmad setup tea` in the assistant chat.
It needs [uv](https://docs.astral.sh/uv/) and the `bmad` skill from BMad Method core; if the skill is missing, add it with `npx skills add bmad-code-org/BMAD-METHOD --skill bmad bmod-core-tools`.

### TEA Offers to Install the Knowledge Base

**Symptom**: A TEA skill says the knowledge base is not installed and offers to install `bmod-tea`.

**Cause**: The `bmod-tea` skill is missing from the folder the TEA skills sit in.
Skills find the knowledge base at `../bmod-tea/knowledge` from their own folder, so `bmod-tea` must be installed beside them, in the same scope.

**Fix**: Accept the offer, or run `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise --skill bmod-tea` yourself.

## Agent Loading Issues

### TEA Loads But Commands Don't Work

**Symptom**: The TEA agent loads, but workflow codes (TF, TD, AT, and the rest) do not execute.

**Cause**: Workflow skills are missing from the install.

```bash
ls .claude/skills/ | grep bmad-testarch   # all nine must be present
# bmad-testarch-atdd       bmad-testarch-evaluate    bmad-testarch-nfr
# bmad-testarch-automate   bmad-testarch-framework   bmad-testarch-test-design
# bmad-testarch-ci         bmad-testarch-test-review bmad-testarch-trace
```

Try invoking the workflow by its full skill name:

```text
/bmad-testarch-test-design    # Claude Code, Cursor, Windsurf
$bmad-testarch-test-design    # Codex
```

If a skill is missing, [reset TEA to a fresh state](#reset-tea-to-a-fresh-state).

### Custom TEA Workflow Does Not Appear

**Symptom**: A custom workflow that used to appear in the `bmad-tea` menu is gone after an update.

**Cause**: TEA is a standalone module.
Custom workflows are not merged into TEA core automatically.

**Fix**: Install the workflow as its own skill, add it to the `bmad-tea` menu with an `[[agent.menu]]` entry in `_bmad/custom/bmad-tea.toml`, then start a fresh chat.
See [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

## Workflow Execution Issues

### GitHub Copilot Slash Command Fails with "No such file or directory"

**Symptom**: A workflow launched through GitHub Copilot in VS Code fails with an error such as `can't open file 'C:\path\to\workspace\scripts\resolve_customization.py': [Errno 2] No such file or directory`.

**Cause**: GitHub Copilot runs skill commands from the workspace root.
Paths relative to the installed skill under `.github/skills/` therefore fail to resolve.

**Fix**: Shipped TEA workflows already anchor every path with `{skill-root}` or `{project-root}`.
If you hit this in a workflow you wrote, apply the same anchoring; see [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

### Workflow Starts But Produces No Output

**Symptom**: The workflow runs but generates no test designs, reports, or tests.

**Cause**: The output directory is missing or not writable, `test_artifacts` is misconfigured, or the run stopped before its output step.

```bash
grep test_artifacts _bmad/config.toml   # default: {project-root}/_bmad-output/test-artifacts
mkdir -p _bmad-output/test-artifacts
chmod -R u+w _bmad-output/test-artifacts
```

If the directory is correct and writable, read the agent's final message for a completion line such as `✓ Test design complete`.
When a run stops early, the last step it names is where to look.

### Subagent Fails to Execute

**Symptom**: The workflow reports a subagent failure, for example "API test generation subagent failed".

**Cause**: A subagent step file is missing, `/tmp` is not writable, the subagent returned an unparseable payload, or the runtime cannot launch parallel workers.

```bash
# 1. The subagent step files must exist
ls .claude/skills/bmad-testarch-automate/steps-c/step-03*.md
# step-03-generate-tests.md plus step-03a-*, step-03b-*, step-03c-aggregate.md

# 2. Workers hand off through one JSON file per suite in /tmp
ls /tmp | grep '^tea-'
# e.g. tea-automate-api-tests-1763049600.json, tea-automate-e2e-tests-1763049600.json

# 3. Check which orchestration mode was selected
grep -E "tea_execution_mode|tea_capability_probe" _bmad/config.toml _bmad/custom/config*.toml
```

If the runtime cannot launch parallel workers, force the deterministic path under `[modules.tea]`, with `bmad setup tea` or by editing `_bmad/config.toml`:

```toml
[modules.tea]
tea_execution_mode = "sequential"
tea_capability_probe = "true"
```

### Knowledge Fragments Not Loading

**Symptom**: The workflow runs but never references knowledge base patterns such as `test-quality` or `network-first`.

**Cause**: The `bmod-tea` skill is missing or not beside the other TEA skills, or `tea-index.csv` or fragment files are missing.

```bash
wc -l < .claude/skills/bmod-tea/knowledge/tea-index.csv      # 60 (header + 59 fragments)
ls .claude/skills/bmod-tea/knowledge/*.md | wc -l             # 59
head -1 .claude/skills/bmod-tea/knowledge/tea-index.csv
# id,name,description,tags,tier,fragment_file

# Workflows load knowledge through a `knowledgeIndex` key in step-file frontmatter,
# so workflow.yaml never mentions fragments
grep -r knowledgeIndex .claude/skills/bmad-testarch-test-design/steps-c/
# knowledgeIndex: '{tea-knowledge}/tea-index.csv'
```

`{tea-knowledge}` is `../bmod-tea/knowledge` from the workflow's own folder.

## Configuration Issues

### Setup Questions Were Never Asked

**Symptom**: TEA runs with defaults you did not choose, or you want to change an answer.

**Cause**: The setup questions come from `bmad setup tea`.

**Fix**: Run `bmad setup tea` in the assistant chat.
On an existing setup it shows each answer with its value and file, and changes the ones you name.

### Config Values Ignored

**Symptom**: TEA ignores the values you set or keeps old values after a config edit.

**Cause**: The value is in the wrong file or table, the TOML does not parse, a key is misspelled, a later layer overrides it, or the chat started before the edit.
TEA reads config once at activation and does not reload mid-chat.

```bash
ls -la _bmad/config.toml _bmad/custom/config.toml _bmad/custom/config.user.toml
uv run _bmad/scripts/resolve_config.py --project-root . --key modules.tea   # the merged values a skill sees
```

TEA keys belong under `[modules.tea]`.
`_bmad/custom/config.user.toml` wins over `_bmad/custom/config.toml`, which wins over `_bmad/config.toml`.
`evaluations_folder` and `ci_platform` are workflow keys. Put them under `[workflow]` in `_bmad/custom/bmad-testarch-evaluate.toml` and `_bmad/custom/bmad-testarch-framework.toml`, respectively. Existing CI platform overrides in `_bmad/custom/bmad-testarch-ci.toml` remain usable unless the framework customization explicitly overrides them.
A `_bmad/tea/config.yaml` from an earlier install is not read by any skill.

If the key name matches [Configuration](/reference/configuration/), save the file, start a fresh chat, and re-run the workflow.

### Playwright Utils Integration Not Working

**Symptom**: Workflows produce no Playwright Utils references even though `tea_use_playwright_utils` is enabled.

```bash
grep tea_use_playwright_utils _bmad/config.toml       # should show: "true"
grep -ic playwright-utils .claude/skills/bmod-tea/knowledge/tea-index.csv   # 19
npm ls @seontechnologies/playwright-utils              # the package must actually be installed
```

Confirm the workflow integrates Playwright Utils at all.
Framework (TF), Test Design (TD), ATDD (AT), Automate (TA), Test Review (RV), and CI all do.
Trace and NFR Evidence Audit do not.

The same three checks apply to Pact.js Utils, which is also on by default: `grep tea_use_pactjs_utils _bmad/config.toml`, `npm ls @seontechnologies/pactjs-utils`, and `ls .claude/skills/bmod-tea/knowledge/pactjs-utils-mandate.md`.

Each integration needs its flag enabled and its package installed.
With a missing package, generation uses the plain framework and Test Review skips the utility criteria.
Run Framework (`TF`) or install the package directly:

```bash
npm install -D @seontechnologies/playwright-utils
```

**If the package is installed and output is still vanilla**, the mandate fragment did not load.
Check that `playwright-utils-mandate.md` is present next to the other fragments and indexed in `tea-index.csv`:

```bash
ls .claude/skills/bmod-tea/knowledge/playwright-utils-mandate.md
grep playwright-utils-mandate .claude/skills/bmod-tea/knowledge/tea-index.csv
```

Then start a fresh chat: fragment selection happens at step 01, so a run that already loaded the vanilla profile keeps it for the rest of the run.

## Output and File Issues

### Test Files Generated in Wrong Location

**Symptom**: Test files are created in an unexpected directory.

**Cause**: `test_artifacts` resolves against the project root, so a misconfigured value or a shell sitting in a subdirectory moves the target.

```bash
grep test_artifacts _bmad/config.toml   # default: {project-root}/_bmad-output/test-artifacts
                                        # change it with bmad setup tea
pwd                                         # must be the project root
```

### Generated Tests Have Syntax Errors

**Symptom**: TEA generates tests with JavaScript or TypeScript syntax errors.

**Cause**: A framework mismatch, usually Playwright syntax emitted for a Cypress project or the reverse.

**Fix**: Name the framework and language explicitly in the prompt, for example "Generate Playwright tests using TypeScript", then lint what came back:

```bash
npx eslint tests/**/*.spec.ts
```

### File Permission Errors

**Symptom**: `EACCES: permission denied` when writing files.

**Cause**: The target directory is not writable, is owned by another user, or the disk is full.

```bash
ls -la _bmad-output/test-artifacts
chmod -R u+w _bmad-output/test-artifacts
df -h
```

## Integration Issues

### Playwright Utils Not Found

**Symptom**: Tests reference Playwright Utils but the imports fail.

```bash
npm install @seontechnologies/playwright-utils
npm ls @seontechnologies/playwright-utils   # confirms the resolved version
```

For a single utility, import `test` from its fixture subpath and `expect` from Playwright.

```typescript
import { expect } from '@playwright/test';
import { test } from '@seontechnologies/playwright-utils/api-request/fixtures';
```

When combining utilities, import from the project's merged fixtures:

```typescript
import { test, expect } from '../support/merged-fixtures';
```

### Pact MCP Reports the Broker as Unreachable

**Symptom**: A workflow says the broker was unreachable and fell back to provider source or an OpenAPI spec.

**Cause**: `tea_pact_mcp` defaults to `"mcp"`, so TEA probes for the SmartBear MCP tools on any contract-testing step.
Without a broker, that probe fails and the workflow degrades on purpose.

The workflow continues with provider source or an OpenAPI spec.
To disable the probe, set this under `[modules.tea]`:

```toml
tea_pact_mcp = "none"
```

To use broker tools, install the server and configure its credentials:

```bash
npm install -g @smartbear/mcp    # Node.js 20+ required
```

Register the server with your MCP client too; the probe reads the session's tool list.
For Claude Code:

```bash
claude mcp add-json -s user smartbear '{"type":"stdio","command":"npx","args":["-y","@smartbear/mcp@latest"],"env":{"PACT_BROKER_BASE_URL":"https://{tenant}.pactflow.io","PACT_BROKER_TOKEN":"<your-api-token>"}}'
```

Other clients take the same server in their own MCP settings file.
Restart the session afterwards; the tool list is read at startup.

The report identifies the source used for provider states and records when broker tools were unavailable.

### Browser Automation Not Working

**Symptom**: `tea_browser_automation` is set to `auto`, `cli`, or `mcp`, but outputs contain no browser features.

**Cause**: For `cli` or `auto`, the CLI is not installed globally.
For `mcp` or `auto`, the MCP server is not configured in the IDE.

```bash
playwright-cli --version                          # cli mode; install: npm i -g @playwright/cli@latest
npx playwright install                            # both modes need the browser binaries
npx @playwright/mcp@latest --version              # mcp mode; confirms the server is reachable
grep tea_browser_automation _bmad/config.toml     # confirm the mode you think you set
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

**Symptom**: A workflow runs for several minutes without completing.

**Cause**: A large codebase to explore, many test files to review, or subagent overhead.

**Fix**: Scope the run to a directory, for example "Review tests in tests/e2e/checkout/".
Use `automate` for targeted generation and `test-review` for specific files.
Check `top` for CPU and memory pressure.

## Getting Help

### Reset TEA to a Fresh State

This clears a partial or corrupted install and is the fallback for every "missing file" symptom above.
Your setup answers live in `_bmad/config.toml` and are not touched.

```bash
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise   # re-adds every TEA skill and bmod-tea
```

Then run `bmad setup tea` in the assistant chat.
It checks the install, reports anything missing or duplicated, and offers to repair it.

### Collecting Diagnostic Information

Include all of this when reporting an issue, plus the full error message and the exact commands that trigger it:

```bash
grep -A3 '^\[bmod\]' .claude/skills/bmod-tea/bmod.toml   # TEA version
sed -n '/^\[modules.tea\]/,/^\[/p' _bmad/config.toml    # your TEA answers
ls .claude/skills/                                        # installed skills
node --version
uname -a
```

### Support Channels

- **Documentation**: [TEA documentation](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/)
- **Bug reports**: [Open an issue](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=issue.md)
- **Questions**: [search existing issues](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) before filing a new one
