---
title: Troubleshooting Guide
description: Diagnose and resolve common issues when using TEA
---

# Troubleshooting Guide

This guide helps you diagnose and resolve common issues when using TEA (Test Engineering Architect).

## Table of Contents

- [Installation Issues](#installation-issues)
- [Agent Loading Issues](#agent-loading-issues)
- [Workflow Execution Issues](#workflow-execution-issues)
- [Knowledge Base Issues](#knowledge-base-issues)
- [Configuration Issues](#configuration-issues)
- [Output and File Issues](#output-and-file-issues)
- [Integration Issues](#integration-issues)
- [Performance Issues](#performance-issues)
- [Getting Help](#getting-help)

---

## Installation Issues

### TEA Module Not Found After Installation

**Symptom**: After running `npx bmad-method install`, TEA agent is not available.

**Causes**:

- TEA was not selected during installation
- Installation process failed silently
- `_bmad/tea/` directory was not created

**Solutions**:

1. Verify TEA installation:

   ```bash
   ls -la _bmad/tea/
   # Should show: agents/, workflows/, testarch/, module.yaml
   ```

2. If missing, reinstall TEA:

   ```bash
   npx bmad-method install
   # Select: Test Architect (TEA)
   ```

3. Check installation logs for errors:
   ```bash
   # Look for error messages during installation
   npx bmad-method install --verbose
   ```

### Installing TEA Behind a Corporate Firewall (Local Repo)

If the BMAD installer can run but cannot fetch the Test Architect module from GitHub, point it to a local clone or internal mirror.

**Goal:** Make the installer clone TEA from a local path instead of the public repo.

1. **Clone TEA locally (or use your internal Git mirror):**

   ```bash
   git clone /path/to/your/internal/mirror/bmad-method-test-architecture-enterprise \
     /path/to/local/bmad-method-test-architecture-enterprise
   ```

2. **Edit the BMAD installer module list** in the BMAD repo you are running the installer from:

   `BMAD-METHOD/tools/cli/external-official-modules.yaml`

   Update the TEA entry to point to your local path:

   ```yaml
   bmad-method-test-architecture-enterprise:
     url: /path/to/local/bmad-method-test-architecture-enterprise
     module-definition: src/module.yaml
     code: tea
     name: 'Test Architect'
     description: 'Master Test Architect for quality strategy, test automation, and release gates'
     defaultSelected: false
     type: bmad-org
     npmPackage: bmad-method-test-architecture-enterprise
   ```

3. **Run the installer:**

   ```bash
   npx bmad-method install
   ```

**Notes:**

- `url:` can be a local filesystem path or an internal Git mirror URL.
- If your environment blocks npm, use an internal npm proxy or allow npm only for the local module cache.

### Module Installation Hangs

**Symptom**: Installation process hangs or times out.

**Causes**:

- Network connectivity issues
- NPM registry timeout
- Disk space issues

**Solutions**:

1. Check network connectivity:

   ```bash
   ping registry.npmjs.org
   ```

2. Check available disk space:

   ```bash
   df -h
   ```

3. Clear NPM cache and retry:

   ```bash
   npm cache clean --force
   npx bmad-method install
   ```

4. Use alternative registry:
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```

---

## Agent Loading Issues

### "Agent Not Found" Error

**Symptom**: Error message: `Error: Agent '_bmad/tea' not found` or `Agent 'tea' could not be loaded`.

**Causes**:

- TEA not installed
- Incorrect agent path
- Corrupted installation

**Solutions**:

1. Verify TEA agent file exists:

   ```bash
   ls -la _bmad/tea/agents/tea.agent.yaml
   ```

2. Validate agent YAML syntax:

   ```bash
   # Check for YAML syntax errors
   node tools/validate-agent-schema.js
   ```

3. Reinstall TEA if corrupted:
   ```bash
   rm -rf _bmad/tea/
   npx bmad-method install
   ```

### TEA Loads But Commands Don't Work

**Symptom**: TEA agent loads successfully, but workflow triggers (TF, TD, AT, etc.) don't execute.

**Causes**:

- Workflow files missing
- Incorrect workflow paths in agent definition
- YAML syntax errors in workflow files

**Solutions**:

1. Check workflow directories exist:

   ```bash
   ls -la _bmad/tea/workflows/testarch/
   # Should show: atdd/, automate/, ci/, framework/, nfr-assess/, test-design/, test-review/, trace/
   ```

2. Validate workflow YAML files:

   ```bash
   # Check each workflow
   cat _bmad/tea/workflows/testarch/test-design/workflow.yaml
   ```

3. Test workflow trigger directly:
   ```bash
   # Try full command
   /bmad:tea:test-design
   ```

---

## Workflow Execution Issues

### Workflow Starts But Produces No Output

**Symptom**: Workflow executes but doesn't generate expected files (test designs, reports, tests).

**Causes**:

- Output directory doesn't exist or lacks write permissions
- Variable `test_artifacts` not configured
- Workflow completed but didn't reach output generation step

**Solutions**:

1. Check output directory configuration:

   ```bash
   cat _bmad/tea/module.yaml | grep test_artifacts
   ```

2. Create output directory if missing:

   ```bash
   mkdir -p test-results
   ```

3. Check directory permissions:

   ```bash
   ls -la test-results/
   # Should be writable
   ```

4. Verify workflow completed all steps:
   ```
   # Check Claude's response for completion message
   # Look for: "✓ Test design complete" or similar
   ```

### Subprocess Fails to Execute

**Symptom**: Workflow reports subprocess failure, e.g., "API test generation subprocess failed".

**Causes**:

- Subprocess step file missing
- Temp file write permissions issue
- Invalid subprocess output format

**Solutions**:

1. Verify subprocess step files exist:

   ```bash
   # For automate workflow
   ls -la _bmad/tea/workflows/testarch/automate/steps-c/step-03*.md
   # Should show: step-03a-subprocess-api.md, step-03b-subprocess-e2e.md, step-03c-aggregate.md
   ```

2. Check temp file directory permissions:

   ```bash
   ls -la /tmp/ | grep bmad-tea
   # Should show temp files if workflow ran
   ```

3. Look for error messages in subprocess output:
   ```
   # Check Claude's response for specific error details
   ```

### Knowledge Fragments Not Loading

**Symptom**: Workflow executes but doesn't reference knowledge base patterns (e.g., no mention of "test-quality", "network-first").

**Causes**:

- `tea-index.csv` missing or corrupted
- Knowledge fragment files missing
- Workflow manifest doesn't specify fragments

**Solutions**:

1. Verify tea-index.csv exists:

   ```bash
   cat _bmad/tea/testarch/tea-index.csv | wc -l
   # Should show 41 lines (header + 40 fragments)
   ```

2. Check knowledge fragment files:

   ```bash
   ls -la _bmad/tea/testarch/knowledge/ | wc -l
   # Should show 40+ files
   ```

3. Validate CSV format:

   ```bash
   head -5 _bmad/tea/testarch/tea-index.csv
   # Should show: fragment_id,title,description,tags,file_path
   ```

4. Check workflow manifest:
   ```bash
   # Each workflow.yaml should specify knowledge_fragments
   grep -A 5 "knowledge_fragments" _bmad/tea/workflows/testarch/test-design/workflow.yaml
   ```

---

## Configuration Issues

### Variables Not Prompting During Installation

**Symptom**: Installation completes without asking for TEA configuration (test_artifacts, Playwright Utils, etc.).

**Causes**:

- Variables marked as `prompt: false` in module.yaml
- Installation running in non-interactive mode
- Module.yaml misconfigured

**Solutions**:

1. Check variable prompt settings:

   ```bash
   cat _bmad/tea/module.yaml | grep -A 3 "test_artifacts"
   # Should show prompt: true
   ```

2. Manually edit module.yaml if needed:

   ```bash
   # Update _bmad/tea/module.yaml
   vi _bmad/tea/module.yaml
   ```

3. Run installation in interactive mode:
   ```bash
   npx bmad-method install --interactive
   ```

### Playwright Utils Integration Not Working

**Symptom**: Workflows don't include Playwright Utils references even though `tea_use_playwright_utils` is enabled.

**Causes**:

- Variable set to `false` in module.yaml
- Playwright Utils knowledge fragments missing
- Workflow doesn't support Playwright Utils integration

**Solutions**:

1. Verify variable setting:

   ```bash
   cat _bmad/tea/module.yaml | grep tea_use_playwright_utils
   # Should show: default: true (if enabled)
   ```

2. Check Playwright Utils fragments exist:

   ```bash
   grep -i "playwright-utils" _bmad/tea/testarch/tea-index.csv
   # Should show 6 fragments
   ```

3. Note: Only certain workflows integrate Playwright Utils:
   - ✅ Framework (TF)
   - ✅ Test Design (TD)
   - ✅ ATDD (AT)
   - ✅ Automate (TA)
   - ✅ Test Review (RV)
   - ❌ CI, Trace, NFR-Assess (not applicable)

---

## Output and File Issues

### Test Files Generated in Wrong Location

**Symptom**: Test files created in unexpected directory.

**Causes**:

- `test_artifacts` variable misconfigured
- Relative path confusion
- Working directory changed

**Solutions**:

1. Check test_artifacts configuration:

   ```bash
   cat _bmad/tea/module.yaml | grep test_artifacts
   ```

2. Use absolute paths:

   ```bash
   # Specify absolute path
   export TEST_ARTIFACTS=/path/to/project/test-results
   ```

3. Verify working directory:
   ```bash
   pwd
   # Should be project root
   ```

### Generated Tests Have Syntax Errors

**Symptom**: TEA generates tests with JavaScript/TypeScript syntax errors.

**Causes**:

- Framework configuration mismatch (Playwright vs Cypress)
- Wrong test template loaded
- Knowledge fragment syntax error

**Solutions**:

1. Specify framework explicitly:

   ```
   # In chat with TEA
   "Generate Playwright tests using TypeScript"
   ```

2. Validate generated tests:

   ```bash
   npx eslint tests/**/*.spec.ts
   ```

3. Check knowledge fragments for errors:
   ```bash
   # Validate markdown syntax
   markdownlint _bmad/tea/testarch/knowledge/*.md
   ```

### File Permission Errors

**Symptom**: Error: `EACCES: permission denied` when writing files.

**Causes**:

- Directory not writable
- File owned by different user
- Disk full

**Solutions**:

1. Check directory permissions:

   ```bash
   ls -la test-results/
   ```

2. Fix permissions:

   ```bash
   chmod -R u+w test-results/
   ```

3. Check disk space:
   ```bash
   df -h
   ```

---

## Integration Issues

### Playwright Utils Not Found

**Symptom**: Tests reference Playwright Utils but imports fail.

**Causes**:

- Playwright Utils not installed
- Wrong import path
- Version mismatch

**Solutions**:

1. Install Playwright Utils:

   ```bash
   npm install @muratkeremozcan/playwright-utils
   ```

2. Verify installation:

   ```bash
   npm ls @muratkeremozcan/playwright-utils
   ```

3. Check import paths in generated tests:
   ```typescript
   // Should be:
   import { expect, test } from '@muratkeremozcan/playwright-utils';
   ```

### Browser Automation Not Working

**Symptom**: `tea_browser_automation` set to `"auto"` or `"cli"` or `"mcp"` but no browser features in outputs.

**Causes**:

- CLI not installed globally (for `cli` or `auto` mode)
- MCP server not configured in IDE (for `mcp` or `auto` mode)
- Variable not read correctly
- Workflow doesn't support browser automation

**Solutions**:

1. For CLI mode, verify CLI is installed:

   ```bash
   playwright-cli --version
   # If missing: npm install -g @playwright/cli@latest
   ```

2. For MCP mode, verify MCP configuration in IDE:

   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@playwright/mcp@latest"]
       }
     }
   }
   ```

   See [Configure Browser Automation — MCP Setup](/docs/how-to/customization/configure-browser-automation.md#for-mcp-mcp-or-auto-mode) for the exact config file path for your tool (Claude Code, Codex, Gemini CLI, Cursor, Windsurf).

3. Check variable setting:

   ```bash
   cat _bmad/tea/config.yaml | grep tea_browser_automation
   ```

4. Restart IDE after configuration changes.

---

## Performance Issues

### Workflows Taking Too Long

**Symptom**: Workflows run for several minutes without completing.

**Causes**:

- Large codebase exploration
- Many test files to review
- Subprocess execution overhead
- Network latency (if using web-based Claude)

**Solutions**:

1. Scope workflows to specific directories:

   ```
   # Instead of "review all tests"
   "Review tests in tests/e2e/checkout/"
   ```

2. Use selective workflows:
   - Use `automate` for targeted test generation
   - Use `test-review` on specific files, not entire suite

3. Check system resources:
   ```bash
   top
   # Look for CPU/memory usage
   ```

### Large Knowledge Base Loading Slowly

**Symptom**: Initial workflow load takes 30+ seconds.

**Causes**:

- All 40 fragments loading at once
- Large fragment file sizes
- Disk I/O bottleneck

**Solutions**:

1. This is expected behavior - knowledge base loading is one-time per workflow
2. Use cached knowledge (workflows cache fragments in memory)
3. For repeated runs, performance should improve

---

## Getting Help

### Debug Mode

Enable debug logging for detailed diagnostics:

```bash
# Set debug environment variable
export DEBUG=bmad:tea:*

# Run workflow with verbose output
# (Note: Exact implementation depends on BMAD Method)
```

### Collecting Diagnostic Information

When reporting issues, include:

1. **TEA Version**:

   ```bash
   cat _bmad/tea/module.yaml | grep version
   ```

2. **BMAD Method Version**:

   ```bash
   bmad --version
   ```

3. **Node Version**:

   ```bash
   node --version
   ```

4. **Operating System**:

   ```bash
   uname -a
   ```

5. **Directory Structure**:

   ```bash
   tree -L 2 _bmad/tea/
   ```

6. **Error Messages**: Copy full error message and stack trace

7. **Steps to Reproduce**: Exact commands that trigger the issue

### Support Channels

1. **Documentation**: [test-architect.bmad-method.org](https://test-architect.bmad-method.org)
2. **GitHub Issues**: [Report a bug](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues/new?template=issue.md)
3. **GitHub Discussions**: [Ask a question](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/discussions)
4. **Migration Guide**: [docs/MIGRATION.md](/docs/MIGRATION.md) for upgrade issues

### Before Reporting an Issue

Check these first:

- [ ] TEA is installed: `ls -la _bmad/tea/`
- [ ] Using correct command namespace: `/bmad:tea:*` not `/bmad:bmm:tea:*`
- [ ] Module.yaml exists and is valid
- [ ] Knowledge base files present (40 fragments)
- [ ] Output directory exists and is writable
- [ ] No disk space issues: `df -h`
- [ ] Node version >=20.0.0: `node --version`
- [ ] Searched existing issues on GitHub

---

## Common Error Messages

### "Module 'tea' not found"

**Fix**: Reinstall TEA module via `npx bmad-method install`

### "Knowledge fragment 'test-quality' not found"

**Fix**: Verify `_bmad/tea/testarch/tea-index.csv` exists and lists the fragment

### "Cannot write to test-results/"

**Fix**: Create directory and fix permissions: `mkdir -p test-results && chmod u+w test-results`

### "Workflow 'test-design' failed at step 3"

**Fix**: Check step file exists: `_bmad/tea/workflows/testarch/test-design/steps-c/step-03-*`

### "Agent YAML validation failed"

**Fix**: Validate YAML syntax: `node tools/validate-agent-schema.js`

### "Subprocess execution timeout"

**Fix**: Large codebases may timeout. Scope workflow to smaller directory.

---

## Advanced Troubleshooting

### Manually Validate Installation

Run this validation script:

```bash
#!/bin/bash
echo "Validating TEA Installation..."

# Check agent file
if [ -f "_bmad/tea/agents/tea.agent.yaml" ]; then
  echo "✓ Agent file exists"
else
  echo "✗ Agent file missing"
fi

# Check workflows
for workflow in atdd automate ci framework nfr-assess test-design test-review trace; do
  if [ -f "_bmad/tea/workflows/testarch/$workflow/workflow.yaml" ]; then
    echo "✓ Workflow: $workflow"
  else
    echo "✗ Workflow missing: $workflow"
  fi
done

# Check knowledge base
fragment_count=$(ls _bmad/tea/testarch/knowledge/*.md 2>/dev/null | wc -l)
echo "Knowledge fragments: $fragment_count (expected: 40)"

# Check tea-index.csv
csv_lines=$(wc -l < _bmad/tea/testarch/tea-index.csv 2>/dev/null || echo "0")
echo "TEA index lines: $csv_lines (expected: 41)"

echo "Validation complete!"
```

### Reset TEA to Fresh State

If all else fails, reset TEA completely:

```bash
# Backup existing configuration
cp _bmad/tea/module.yaml /tmp/tea-module-backup.yaml

# Remove TEA
rm -rf _bmad/tea/

# Reinstall
npx bmad-method install
# Select: Test Architect (TEA)

# Restore configuration if needed
cp /tmp/tea-module-backup.yaml _bmad/tea/module.yaml
```

---

**Still stuck?** Open a [GitHub Issue](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues) with diagnostic information.
