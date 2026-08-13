---
name: Bug Report
about: Report a problem or something that's not working with TEA
title: ''
labels: 'bug'
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**Steps to reproduce**

1. What TEA workflow were you running? (e.g., `test-design`, `automate`, `atdd`)
2. What steps can recreate the issue?
3. What was the exact command or trigger used?

**Expected behavior**
A clear and concise description of what you expected to happen.

**Environment**

- **TEA Version**: [e.g., 1.0.0]
- **BMAD Method Version**: [e.g., 7.0.0]
- **Node Version**: [output of `node --version`]
- **Operating System**: [e.g., macOS 14.0, Ubuntu 22.04, Windows 11]
- **Agentic IDE**: [e.g., Claude Code, Windsurf, Cursor]
- **Model Used**: [e.g., Claude Sonnet 4.5, GPT-4]

**Workflow Details (if applicable)**

- **Workflow**: [e.g., test-design, automate, atdd, test-review, trace, nfr-assess, ci, framework]
- **Test Framework**: [e.g., Playwright, Cypress]
- **Playwright Utils Enabled**: [yes/no]
- **MCP Enhancements Enabled**: [yes/no]

**Screenshots or output**
If applicable, add:

- Screenshots of the issue
- Console output or error messages
- Generated test files or reports

**Additional context**
Add any other context about the problem:

- Project type (greenfield/brownfield)
- Codebase size
- Any custom TEA configuration
- Related workflows or knowledge fragments

**Troubleshooting Checklist**
Before submitting, please check:

- [ ] I've read the [Troubleshooting Guide](https://test-architect.bmad-method.org/reference/troubleshooting)
- [ ] I've verified TEA is installed: `ls -la _bmad/tea/`
- [ ] I'm using the current invocation: `/bmad-testarch-*` (Claude Code, Cursor, Windsurf) or `$bmad-testarch-*` (Codex)
- [ ] I've checked for existing issues on GitHub

**Contribution**
If you'd like to contribute a fix, please indicate you're working on it or link to your PR. See [CONTRIBUTING.md](../../CONTRIBUTING.md) — contributions are always welcome!
