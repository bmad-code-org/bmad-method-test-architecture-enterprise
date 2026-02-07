---
title: 'Enable TEA MCP Enhancements (Deprecated)'
description: This guide has been superseded by Configure Browser Automation
---

# Enable TEA MCP Enhancements

> **Deprecated:** This guide has been replaced by [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md).

The `tea_use_mcp_enhancements` boolean flag has been replaced by `tea_browser_automation`, which supports four modes: `auto`, `cli`, `mcp`, and `none`.

**Migration:**

| Old Setting                       | New Equivalent                   |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

Please see [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md) for full setup instructions.

---

Generated with [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
