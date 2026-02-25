---
title: 'Configure Browser Automation'
description: Set up Playwright CLI and MCP for browser automation in TEA workflows
---

# Configure Browser Automation

TEA can interact with live browsers during test generation — to verify selectors, explore UIs, capture evidence, and debug failures. Two complementary tools are available:

**CLI and MCP are complementary tools, not competitors.** Auto mode uses each where it shines — CLI for token-efficient stateless snapshots, MCP for rich stateful automation — while giving users full control to override when they know better.

## The Four Modes

TEA's browser automation is controlled by `tea_browser_automation` in `_bmad/tea/config.yaml`:

```yaml
tea_browser_automation: 'auto' # auto | cli | mcp | none
```

| Mode   | Behavior                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` | TEA picks the right tool per action — CLI for quick lookups, MCP for complex flows. Falls back gracefully if only one tool is installed. **(Recommended)** |
| `cli`  | CLI only. MCP ignored even if configured.                                                                                                                  |
| `mcp`  | MCP only. CLI ignored even if installed. Same as the old `tea_use_mcp_enhancements: true`.                                                                 |
| `none` | No browser interaction. TEA generates from docs and code analysis only.                                                                                    |

## Prerequisites

### For CLI (`cli` or `auto` mode)

```bash
npm install -g @playwright/cli@latest    # Install globally (Node.js 18+)
playwright-cli install --skills          # Register as an agent skill
```

The global npm install is one-time. The skills install (`playwright-cli install --skills`) should be run from your project root — it registers skills in your project's `.claude/skills/` directory (Claude Code, GitHub Copilot, and other coding agents that support the skills convention). Agents without skills support can still use the CLI directly via `playwright-cli --help`.

### For MCP (`mcp` or `auto` mode)

Add these MCP server entries to your tool's configuration file:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "playwright-test": {
      "command": "npx",
      "args": ["playwright", "run-test-mcp-server"]
    },
    "smartbear": {
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

The `smartbear` server is optional — only needed if you use the [Pact MCP integration](/docs/how-to/customization/configure-browser-automation.md#related) for contract testing workflows. See the [pact-mcp knowledge fragment](../../src/testarch/knowledge/pact-mcp.md) for details.

#### Where to put the config

| Tool        | Config File                           | Format                 |
| ----------- | ------------------------------------- | ---------------------- |
| Claude Code | `~/.claude.json`                      | JSON (`mcpServers`)    |
| Codex       | `~/.codex/config.toml`                | TOML (`[mcp_servers]`) |
| Gemini CLI  | `~/.gemini/settings.json`             | JSON (`mcpServers`)    |
| Cursor      | `~/.cursor/mcp.json`                  | JSON (`mcpServers`)    |
| Windsurf    | `~/.codeium/windsurf/mcp_config.json` | JSON (`mcpServers`)    |

#### CLI shortcuts

Claude Code and Codex support adding MCP servers from the command line:

```bash
# Claude Code — Playwright
claude mcp add playwright -- npx @playwright/mcp@latest
claude mcp add playwright-test -- npx playwright run-test-mcp-server

# Claude Code — SmartBear (Pact)
claude mcp add smartbear --scope user \
  -e PACT_BROKER_BASE_URL=https://{tenant}.pactflow.io \
  -e PACT_BROKER_TOKEN=<your-token> \
  -- npx -y @smartbear/mcp@latest

# Codex — Playwright
codex mcp add playwright -- npx @playwright/mcp@latest
codex mcp add playwright-test -- npx playwright run-test-mcp-server

# Codex — SmartBear (Pact)
codex mcp add smartbear -- npx -y @smartbear/mcp@latest
```

#### Codex TOML format

Codex uses TOML instead of JSON. If editing the config file manually:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]

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

When `tea_browser_automation: "auto"`, TEA picks the right tool per action:

### Priority 1: User Override

If you explicitly request CLI or MCP in your prompt (e.g., "use the CLI to explore this page"), TEA honors that.

### Priority 2: Auto Heuristic

**CLI preferred for quick, stateless tasks:**

- Open page, take snapshot, list elements
- One-shot data capture (selectors, labels, page structure)
- Locator verification (checking if a locator exists on a page)
- Capturing screenshots/traces for evidence

**MCP preferred for stateful, multi-step flows:**

- Long sequences where state must carry across many steps
- Multi-tab flows, file uploads, repeated edits
- Complex interaction patterns (drag/drop, multi-step wizards)
- Self-healing mode (analyzing failures with full DOM access)

### Priority 3: Fallback

- If CLI returns "command not found" -> fall back to MCP
- If MCP is unavailable -> fall back to CLI
- If neither is available -> fall back to `none` mode

## Which Workflows Benefit

| Workflow      | Default Tool (auto) | Use Case                                               |
| ------------- | ------------------- | ------------------------------------------------------ |
| `test-design` | CLI                 | Page discovery, snapshots — stateless                  |
| `atdd`        | CLI + MCP           | CLI for baseline capture, MCP for complex interactions |
| `automate`    | CLI + MCP           | CLI for selector verification, MCP for healing         |
| `test-review` | CLI                 | Traces, screenshots, network — stateless evidence      |
| `nfr-assess`  | CLI                 | Network monitoring, timing — stateless                 |

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

---

Generated with [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
