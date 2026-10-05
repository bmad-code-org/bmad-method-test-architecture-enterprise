---
title: Troubleshooting Guide
description: Diagnose and resolve common issues when using TEA
---

# Troubleshooting Guide

## Installation Issues

TEA installs as skills. `npx skills add` copies each one into your host's skills folder, such as `.claude/skills/` or `.agents/skills/`. The commands below use `.claude/skills/`; substitute your host's folder.

### TEA Skills Not Found After Installation

**Symptom**: after `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise`, the TEA agent or workflows are not available.

**Cause**: the install did not finish, it went to a different scope (project or global) than the one your host reads, or the host was started before the skills existed.

```bash
ls .claude/skills/ | grep -E 'bmad-tea|bmad-testarch|bmad-teach|bmod-tea'
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise   # re-run to add what is missing
```

Expect `bmad-tea`, `bmad-teach-me-testing`, nine `bmad-testarch-*` workflows, and `bmod-tea`. Restart the host or start a fresh chat after installing.

### Install Hangs or Cannot Reach GitHub

**Symptom**: `npx skills add` hangs, times out, or cannot fetch the repository.

**Cause**: network connectivity, an npm registry timeout, or a firewall that blocks GitHub.

```bash
ping registry.npmjs.org
npm cache clean --force                              # retry on a clean cache
npm config set registry https://registry.npmjs.org/  # if a proxy rewrote the registry
```

If GitHub itself is blocked, see [Install TEA Behind a Corporate Firewall](/how-to/install-behind-firewall/).

### TEA Says It Is Not Set Up

**Symptom**: a TEA skill stops and asks you to run `bmad setup tea`.

**Cause**: `_bmad/config.toml` is missing or has no `[modules.tea]` table. Installing the skills does not answer the setup questions.

**Fix**: run `bmad setup tea` in the assistant chat. It needs the `bmad` skill from BMad Method core; if that is missing, add it with `npx skills add bmad-code-org/BMAD-METHOD --skill bmad`.

### TEA Offers to Install the Knowledge Base

**Symptom**: a TEA skill says the knowledge base is not installed and offers to install `bmod-tea`.

**Cause**: the `bmod-tea` skill is missing from the folder the TEA skills sit in. Skills find the knowledge base at `../bmod-tea/knowledge` from their own folder, so `bmod-tea` must be installed beside them, in the same scope.

**Fix**: accept the offer, or run `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise --skill bmod-tea` yourself.

## Agent Loading Issues

### TEA Loads But Commands Don't Work

**Symptom**: the TEA agent loads, but workflow codes (TF, TD, AT, and the rest) do not execute.

**Cause**: workflow skills are missing from the install.

```bash
ls .claude/skills/ | grep bmad-testarch   # all nine must be present
# bmad-testarch-atdd       bmad-testarch-evaluate    bmad-testarch-nfr
# bmad-testarch-automate   bmad-testarch-framework   bmad-testarch-test-design
# bmad-testarch-ci         bmad-testarch-test-review bmad-testarch-trace
```

Then invoke the workflow by its skill name instead of the two-letter code:

```text
/bmad-testarch-test-design    # Claude Code, Cursor, Windsurf
$bmad-testarch-test-design    # Codex
```

If a skill is missing, [reset TEA to a fresh state](#reset-tea-to-a-fresh-state).

### Custom TEA Workflow Does Not Appear

**Symptom**: a custom workflow that used to appear in the `bmad-tea` menu is gone after an update.

**Cause**: TEA is a standalone module. Custom workflows are not merged into TEA core automatically.

**Fix**: install the workflow as its own skill, add it to the `bmad-tea` menu with an `[[agent.menu]]` entry in `_bmad/custom/bmad-tea.toml`, then start a fresh chat. See [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

## Workflow Execution Issues

### GitHub Copilot Slash Command Fails with "No such file or directory"

**Symptom**: a workflow launched through GitHub Copilot in VS Code fails with an error such as `can't open file 'C:\path\to\workspace\scripts\resolve_customization.py': [Errno 2] No such file or directory`.

**Cause**: GitHub Copilot runs skill commands from the workspace root rather than from the installed skill folder under `.github/skills/`, so a path written relative to the skill does not resolve.

**Fix**: shipped TEA workflows already anchor every path with `{skill-root}` or `{project-root}`. If you hit this in a workflow you wrote, apply the same anchoring; see [Extend TEA with Custom Workflows](../how-to/customization/extend-tea-with-custom-workflows.md).

### Workflow Starts But Produces No Output

**Symptom**: the workflow runs but generates no test designs, reports, or tests.

**Cause**: the output directory is missing or not writable, `test_artifacts` is misconfigured, or the run stopped before its output step.

```bash
grep test_artifacts _bmad/config.toml   # default: {project-root}/_bmad-output/test-artifacts
mkdir -p _bmad-output/test-artifacts
chmod -R u+w _bmad-output/test-artifacts
```

If the directory is correct and writable, read the agent's final message for a completion line such as `✓ Test design complete`. When a run stops early, the last step it names is where to look.

### Subagent Fails to Execute

**Symptom**: the workflow reports a subagent failure, for example "API test generation subagent failed".

**Cause**: a subagent step file is missing, `/tmp` is not writable, the subagent returned an unparseable payload, or the runtime cannot launch parallel workers.

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

**Symptom**: the workflow runs but never references knowledge base patterns such as `test-quality` or `network-first`.

**Cause**: the `bmod-tea` skill is missing or not beside the other TEA skills, or `tea-index.csv` or fragment files are missing.

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

**Cause**: installing the skills does not ask the setup questions. `bmad setup tea` does.

**Fix**: run `bmad setup tea` in the assistant chat. On an existing setup it shows each answer with its value and file, and changes the ones you name.

### Config Values Ignored

**Symptom**: TEA uses defaults instead of the values you set, or keeps using old values after you edited the config.

**Cause**: the value is in the wrong file or table, the TOML does not parse, a key is misspelled, a later layer overrides it, or the chat started before the edit. TEA reads config once at activation and does not reload mid-chat.

```bash
ls -la _bmad/config.toml _bmad/custom/config.toml _bmad/custom/config.user.toml
uv run _bmad/scripts/resolve_config.py --project-root . --key modules.tea   # the merged values a skill sees
```

TEA keys belong under `[modules.tea]`. `_bmad/custom/config.user.toml` wins over `_bmad/custom/config.toml`, which wins over `_bmad/config.toml`. `evaluations_folder` and `ci_platform` are not module keys; they go in `_bmad/custom/bmad-testarch-evaluate.toml` and `_bmad/custom/bmad-testarch-ci.toml` under `[workflow]`. A `_bmad/tea/config.yaml` from an earlier install is not read by any skill.

If the key name matches [Configuration](/reference/configuration/), save the file, start a fresh chat, and re-run the workflow.

### Playwright Utils Integration Not Working

**Symptom**: workflows produce no Playwright Utils references even though `tea_use_playwright_utils` is enabled.

```bash
grep tea_use_playwright_utils _bmad/config.toml       # should show: "true"
grep -ic playwright-utils .claude/skills/bmod-tea/knowledge/tea-index.csv   # 21
npm ls @seontechnologies/playwright-utils              # the package must actually be installed
```

Confirm the workflow integrates Playwright Utils at all. Framework (TF), Test Design (TD), ATDD (AT), Automate (TA), Test Review (RV), and CI all do. Trace and NFR Evidence Audit do not.

The same three checks apply to Pact.js Utils, which is also on by default: `grep tea_use_pactjs_utils _bmad/config.toml`, `npm ls @seontechnologies/pactjs-utils`, and `ls .claude/skills/bmod-tea/knowledge/pactjs-utils-mandate.md`.

**If a flag is `true` and its package is missing**, that is the usual cause, and it applies to both integrations independently: `tea_use_playwright_utils` needs `@seontechnologies/playwright-utils`, `tea_use_pactjs_utils` needs `@seontechnologies/pactjs-utils`. Either one can be active while the other is not. Generation will not scaffold imports against a package the project does not have, and Test Review closes the `M9` gate rather than deducting. Run the Framework (TF) workflow, or install it directly:

```bash
npm install -D @seontechnologies/playwright-utils
```

**If the package is installed and output is still vanilla**, the mandate fragment did not load. Check that `playwright-utils-mandate.md` is present next to the other fragments and indexed in `tea-index.csv`:

```bash
ls .claude/skills/bmod-tea/knowledge/playwright-utils-mandate.md
grep playwright-utils-mandate .claude/skills/bmod-tea/knowledge/tea-index.csv
```

Then start a fresh chat: fragment selection happens at step 01, so a run that already loaded the vanilla profile keeps it for the rest of the run.

## Output and File Issues

### Test Files Generated in Wrong Location

**Symptom**: test files are created in an unexpected directory.

**Cause**: `test_artifacts` resolves against the project root, so a misconfigured value or a shell sitting in a subdirectory moves the target.

```bash
grep test_artifacts _bmad/config.toml   # default: {project-root}/_bmad-output/test-artifacts
                                        # change it with bmad setup tea
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

### Pact MCP Reports the Broker as Unreachable

**Symptom**: a workflow says the broker was unreachable and fell back to provider source or an OpenAPI spec.

**Cause**: `tea_pact_mcp` defaults to `"mcp"`, so TEA probes for the SmartBear MCP tools on any contract-testing step. Without a broker, that probe fails and the workflow degrades on purpose.

**This is not an error.** The run completed; it just used a lower-authority source for provider states. To silence the probe entirely, set this under `[modules.tea]`:

```toml
tea_pact_mcp = "none"
```

To make the probe succeed instead, configure the server and its credentials:

```bash
npm install -g @smartbear/mcp    # Node.js 20+ required
```

Installing the server is not enough: the MCP client has to be told about it, since the probe checks the session's tool list. For Claude Code:

```bash
claude mcp add-json -s user smartbear '{"type":"stdio","command":"npx","args":["-y","@smartbear/mcp@latest"],"env":{"PACT_BROKER_BASE_URL":"https://{tenant}.pactflow.io","PACT_BROKER_TOKEN":"<your-api-token>"}}'
```

Other clients take the same server in their own MCP settings file. Restart the session afterwards; the tool list is read at startup.

TEA never blocks on the broker and never presents inferred provider states as broker data, so a failed probe cannot silently corrupt a contract.

### Browser Automation Not Working

**Symptom**: `tea_browser_automation` is set to `auto`, `cli`, or `mcp`, but outputs contain no browser features.

**Cause**: for `cli` or `auto`, the CLI is not installed globally. For `mcp` or `auto`, the MCP server is not configured in the IDE.

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

**Symptom**: a workflow runs for several minutes without completing.

**Cause**: a large codebase to explore, many test files to review, or subagent overhead.

**Fix**: scope the run to a directory instead of the whole suite, for example "Review tests in tests/e2e/checkout/" rather than "review all tests". Use `automate` for targeted generation and `test-review` on specific files. Check `top` for CPU and memory pressure.

The first workflow run in a session loads knowledge fragments from disk and is slower than later runs. That is expected.

## Getting Help

### Reset TEA to a Fresh State

This clears a partial or corrupted install and is the fallback for every "missing file" symptom above. Your setup answers live in `_bmad/config.toml` and are not touched.

```bash
npx skills add bmad-code-org/bmad-method-test-architecture-enterprise   # re-adds every TEA skill and bmod-tea
```

Then run `bmad setup tea` in the assistant chat. It checks the install, reports anything missing or duplicated, and offers to repair it.

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
