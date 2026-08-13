---
title: 'Configure Browser Automation'
description: Set up Playwright CLI and MCP for browser automation in TEA workflows
---

# Configure Browser Automation

TEA can interact with live browsers during test generation: verify selectors, explore UIs, capture evidence, and debug failures. Two tools do this, and `auto` mode combines them.

## The Four Modes

TEA's browser automation is controlled by `tea_browser_automation` in `_bmad/tea/config.yaml`:

```yaml
tea_browser_automation: 'auto' # auto | cli | mcp | none
```

| Mode   | Behavior                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` | TEA picks the right tool per action: CLI for quick lookups, MCP for complex flows. Falls back gracefully if only one tool is installed. **(Recommended)** |
| `cli`  | CLI only. MCP ignored even if configured.                                                                                                                 |
| `mcp`  | MCP only. CLI ignored even if installed. Same as the old `tea_use_mcp_enhancements: true`.                                                                |
| `none` | No browser interaction. TEA generates from docs and code analysis only.                                                                                   |

## Prerequisites

### For CLI (`cli` or `auto` mode)

```bash
npm install -g @playwright/cli@latest    # Install globally (Node.js 18+)
playwright-cli install --skills          # Register as an agent skill
```

The global npm install is one-time. The skills install (`playwright-cli install --skills`) should be run from your project root; it registers skills in your active tool's project skills directory (for example, Claude Code uses `.claude/skills/` and Codex uses `.agents/skills/`). Agents without skills support can still use the CLI directly via `playwright-cli --help`.

### For MCP (`mcp` or `auto` mode)

Add these MCP server entries to your tool's configuration file:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "playwright-test": {
      "type": "stdio",
      "command": "npx",
      "args": ["playwright", "run-test-mcp-server"]
    },
    "smartbear": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smartbear/mcp@latest"],
      "env": {
        "PACT_BROKER_BASE_URL": "https://{tenant}.pactflow.io",
        "PACT_BROKER_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

The `smartbear` server is optional. Add it only if you use the [Pact MCP integration](/docs/reference/configuration.md#tea_pact_mcp) for contract testing workflows. See the [pact-mcp knowledge fragment](/docs/reference/knowledge-base.md#pact-contract-testing-integration) for details.

#### Where to put the config

| Tool              | Config File                           | Format                 |
| ----------------- | ------------------------------------- | ---------------------- |
| Claude Code       | `~/.claude.json`                      | JSON (`mcpServers`)    |
| Codex             | `~/.codex/config.toml`                | TOML (`[mcp_servers]`) |
| Gemini CLI        | `~/.gemini/settings.json`             | JSON (`mcpServers`)    |
| Cursor            | `~/.cursor/mcp.json`                  | JSON (`mcpServers`)    |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json` | JSON (`mcpServers`)    |
| VS Code (Copilot) | `.vscode/mcp.json`                    | JSON (`servers`)       |

> **Claude Code tip**: Prefer the `claude mcp add` CLI over manual JSON editing; it sets the correct `type` field and validates the config. Use `-s user` for global (all projects) or omit for per-project (default).

#### CLI shortcuts

Claude Code and Codex support adding MCP servers from the command line:

```bash
# Claude Code: Playwright (use -s user for global, omit for per-project)
claude mcp add -s user --transport stdio playwright -- npx -y @playwright/mcp@latest
claude mcp add -s user --transport stdio playwright-test -- npx playwright run-test-mcp-server

# Claude Code: SmartBear (Pact). Use add-json for servers with env vars
claude mcp add-json -s user smartbear \
  '{"type":"stdio","command":"npx","args":["-y","@smartbear/mcp@latest"],"env":{"PACT_BROKER_BASE_URL":"https://{tenant}.pactflow.io","PACT_BROKER_TOKEN":"<your-token>"}}'

# Codex: Playwright
codex mcp add playwright -- npx -y @playwright/mcp@latest
codex mcp add playwright-test -- npx playwright run-test-mcp-server

# Codex: SmartBear (Pact)
codex mcp add smartbear -- npx -y @smartbear/mcp@latest
```

#### Codex TOML format

Codex uses TOML instead of JSON. If editing the config file manually:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.playwright-test]
command = "npx"
args = ["playwright", "run-test-mcp-server"]

[mcp_servers.smartbear]
command = "npx"
args = ["-y", "@smartbear/mcp@latest"]

[mcp_servers.smartbear.env]
PACT_BROKER_BASE_URL = "https://{tenant}.pactflow.io"
PACT_BROKER_TOKEN = "<your-api-token>"
```

Note the key is `mcp_servers` (underscored), not `mcpServers`.

## How Auto Mode Works

An explicit request in your prompt wins ("use the CLI to explore this page"). Otherwise TEA takes the CLI for stateless work (snapshots, locator verification, evidence capture) and MCP for stateful flows (multi-tab, file uploads, repeated edits, self-healing). If only one tool is installed it uses that one; with neither it behaves as `none`.

Full selection rules: [TEA Overview: Browser Automation](/docs/explanation/tea-overview.md#browser-automation-playwright-cli-mcp).

## Which Workflows Benefit

| Workflow      | Default Tool (auto) | Use Case                                               |
| ------------- | ------------------- | ------------------------------------------------------ |
| `test-design` | CLI                 | Page discovery, snapshots (stateless)                  |
| `atdd`        | CLI + MCP           | CLI for baseline capture, MCP for complex interactions |
| `automate`    | CLI + MCP           | CLI for selector verification, MCP for healing         |
| `test-review` | CLI                 | Traces, screenshots, network (stateless evidence)      |
| `nfr-assess`  | CLI                 | Network monitoring, timing (stateless)                 |

## Overriding Per Request

Even in `auto` mode, you can override per-request:

```
"Use the CLI to snapshot the login page"
"Open MCP browser and walk through the checkout wizard"
```

TEA will honor your explicit request.

## Migrating from tea_use_mcp_enhancements

The old boolean flag `tea_use_mcp_enhancements` has been replaced:

| Old Setting                       | New Equivalent                   |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

The BMAD installer will auto-migrate existing configs.

## Troubleshooting

### CLI Not Working

```bash
# Verify CLI is installed
playwright-cli --version

# Install if missing
npm install -g @playwright/cli@latest

# Install skills
playwright-cli install --skills
```

### MCP Not Working

1. Check MCP servers are configured in your IDE
2. Restart your IDE after configuration changes
3. Verify: `npx @playwright/mcp@latest --version`

### Auto Mode Not Selecting Expected Tool

Auto mode logs its decisions:

- "Using CLI for snapshot (stateless discovery)"
- "Using MCP for multi-step recording (stateful flow)"

Check the workflow output for these messages.

### Session Cleanup Issues

If you see orphaned browser processes:

```bash
# List active sessions
playwright-cli list

# Close a specific session
playwright-cli -s=tea-explore close

# Emergency cleanup (kills ALL sessions -- use only manually)
playwright-cli close-all
```

## Related

- [TEA Overview -- Browser Automation](/docs/explanation/tea-overview.md#browser-automation-playwright-cli-mcp)
- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md)
- [TEA Configuration Reference](/docs/reference/configuration.md)
