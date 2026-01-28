---
title: Migration Guide
description: Migrate from BMM-embedded TEA to standalone TEA module (v1.0.0+)
---

# Migration Guide: BMM-Embedded TEA → Standalone TEA Module

This guide helps you migrate from the BMM-embedded version of TEA to the standalone TEA module (v1.0.0+).

## Overview

TEA (Test Engineering Architect) has been extracted from the BMAD Method (BMM) core repository into a standalone, independently installable module. This allows:

- **Independent versioning** and release cycles
- **Optional installation** - use TEA only when needed
- **Cleaner separation** of concerns
- **Easier maintenance** and contribution

## Breaking Changes

### 1. Command Namespace

All TEA commands have changed namespace from `/bmad:bmm:tea:*` to `/bmad:tea:*`.

| Old Command (BMM-embedded)     | New Command (Standalone) |
| ------------------------------ | ------------------------ |
| `/bmad:bmm:tea:framework`      | `/bmad:tea:framework`    |
| `/bmad:bmm:tea:ci`             | `/bmad:tea:ci`           |
| `/bmad:bmm:tea:test-design`    | `/bmad:tea:test-design`  |
| `/bmad:bmm:tea:atdd`           | `/bmad:tea:atdd`         |
| `/bmad:bmm:tea:automate`       | `/bmad:tea:automate`     |
| `/bmad:bmm:tea:test-review`    | `/bmad:tea:test-review`  |
| `/bmad:bmm:tea:trace`          | `/bmad:tea:trace`        |
| `/bmad:bmm:tea:nfr-assess`     | `/bmad:tea:nfr-assess`   |
| **Short triggers** (unchanged) |                          |
| `TF`, `CI`, `TD`, `AT`, `TA`   | Same                     |
| `RV`, `TR`, `NR`               | Same                     |

**Action Required**: Update any saved prompts, scripts, or documentation that reference the old commands.

### 2. Module Installation

TEA is no longer bundled with BMM by default. You must install it separately.

#### Old Behavior (BMM-embedded)

```bash
# TEA automatically included
npx bmad-method install
```

#### New Behavior (Standalone)

```bash
# Install BMAD Method first
npx bmad-method install
# Select modules (BMM, TEA, etc.)

# Or install TEA separately later
npx bmad-method install
# Select: Test Architect (TEA)
```

**Action Required**: Install TEA module explicitly if not already installed.

### 3. File Path Changes

Internal file paths have changed to reflect TEA's standalone structure.

| Old Path (BMM-embedded)         | New Path (Standalone)       |
| ------------------------------- | --------------------------- |
| `src/bmm/agents/tea.agent.yaml` | `src/agents/tea.agent.yaml` |
| `src/bmm/testarch/knowledge/`   | `src/testarch/knowledge/`   |
| `src/bmm/workflows/testarch/`   | `src/workflows/testarch/`   |
| `_bmad/bmm/tea`                 | `_bmad/tea/`                |

**Action Required**: None for end users. This only affects contributors and maintainers.

### 4. Configuration Variables

TEA configuration is now in its own `src/module.yaml` instead of BMM's configuration.

#### Old Configuration (BMM-embedded)

Configuration was embedded in BMM's module.yaml:

```yaml
# In BMM module.yaml
variables:
  bmm_test_artifacts: test-results
  # TEA variables mixed with BMM
```

#### New Configuration (Standalone)

TEA has its own configuration file:

```yaml
# In TEA src/module.yaml
variables:
  test_artifacts:
    description: Base folder for test artifacts
    default: test-results
    prompt: true

  tea_use_playwright_utils:
    description: Enable Playwright Utils integration
    default: false
    prompt: true

  tea_use_mcp_enhancements:
    description: Enable Playwright MCP enhancements
    default: false
    prompt: true

  test_design_output:
    description: Test design documents folder
    default: test-design
    prompt: false

  test_review_output:
    description: Test review reports folder
    default: test-review
    prompt: false

  trace_output:
    description: Traceability reports folder
    default: trace
    prompt: false
```

**Action Required**: Reconfigure TEA variables during installation or update `_bmad/tea/module.yaml` manually.

## Migration Steps

### Step 1: Check Current BMAD Version

Ensure you have BMAD Method v7.0.0+ (upcoming) or the latest version that supports modular installation.

```bash
# Check BMAD version
bmad --version
```

### Step 2: Install Standalone TEA

Run the BMAD installer and select TEA:

```bash
npx bmad-method install
# When prompted, select:
# ✓ Test Architect (TEA)
```

Follow the installation prompts to configure TEA variables:

1. **test_artifacts**: Base folder for test outputs (default: `test-results`)
2. **tea_use_playwright_utils**: Enable Playwright Utils integration (yes/no)
3. **tea_use_mcp_enhancements**: Enable MCP enhancements (yes/no)

### Step 3: Update Command References

Update any saved prompts, documentation, or scripts:

**Example: Updating CI/CD Scripts**

```bash
# Old
claude "/bmad:bmm:tea:test-design"

# New
claude "/bmad:tea:test-design"
```

**Example: Updating Documentation**

```markdown
<!-- Old -->

Run `/bmad:bmm:tea:automate` to expand test coverage.

<!-- New -->

Run `/bmad:tea:automate` to expand test coverage.
```

### Step 4: Verify Installation

Load the TEA agent and run a test command:

```bash
# Start Claude Code or Claude Desktop
claude

# Load TEA agent
tea

# Test a workflow
test-design
```

You should see TEA load successfully with the message:

```
✓ Loaded agent: Murat (Master Test Architect and Quality Advisor)
```

### Step 5: Validate Configuration

Check that TEA variables are correctly configured:

```bash
# Check _bmad directory
ls -la _bmad/tea/

# Verify module.yaml
cat _bmad/tea/module.yaml
```

Expected contents:

```
_bmad/tea/
├── module.yaml         # TEA configuration
├── agents/
│   └── tea.agent.yaml
├── workflows/
│   └── testarch/       # 8 workflows
└── testarch/
    ├── tea-index.csv   # Knowledge base index
    └── knowledge/      # 34 fragments
```

## What Stays the Same

Despite the migration, these aspects remain **unchanged**:

✅ **Short Trigger Commands**: `TF`, `CI`, `TD`, `AT`, `TA`, `RV`, `TR`, `NR` work exactly the same

✅ **Workflow Behavior**: All 8 workflows function identically

✅ **Knowledge Base**: Same 34 knowledge fragments with identical content

✅ **Output Formats**: Test designs, reports, and checklists maintain the same structure

✅ **Playwright Utils Integration**: Same integration patterns and utilities

✅ **MCP Enhancements**: Same enhancements available with identical configuration

✅ **Quality Standards**: Same testing best practices and quality gates

## Configuration Differences

### Old: BMM-Embedded Configuration

```yaml
# Variables were part of BMM module
variables:
  bmm_test_artifacts: test-results
  # Mixed BMM and TEA config
```

### New: Standalone Configuration

```yaml
# TEA has its own module.yaml
code: tea
name: Test Architect (TEA)

variables:
  test_artifacts:
    description: Base folder for test artifacts
    default: test-results
    prompt: true

  tea_use_playwright_utils:
    description: Enable Playwright Utils integration
    default: false
    prompt: true

  tea_use_mcp_enhancements:
    description: Enable Playwright MCP enhancements
    default: false
    prompt: true

  test_design_output:
    description: Test design documents folder
    default: test-design
    prompt: false

  test_review_output:
    description: Test review reports folder
    default: test-review
    prompt: false

  trace_output:
    description: Traceability reports folder
    default: trace
    prompt: false
```

## Troubleshooting

### Issue: "Agent Not Found" Error

**Symptom**: `Error: Agent '_bmad/tea' not found`

**Solution**:

1. Verify TEA is installed:
   ```bash
   ls -la _bmad/tea/
   ```
2. If missing, reinstall TEA:
   ```bash
   npx bmad-method install
   # Select: Test Architect (TEA)
   ```

### Issue: Old Commands Not Working

**Symptom**: `/bmad:bmm:tea:test-design` returns "Command not found"

**Solution**: Update to new namespace:

```bash
# Old (won't work)
/bmad:bmm:tea:test-design

# New (correct)
/bmad:tea:test-design
```

### Issue: Configuration Variables Not Set

**Symptom**: TEA asks for variables every time

**Solution**: Ensure `_bmad/tea/module.yaml` exists and contains variable definitions.

### Issue: Knowledge Base Fragments Not Loading

**Symptom**: TEA workflows run but don't include knowledge base context

**Solution**:

1. Check tea-index.csv exists:
   ```bash
   ls -la _bmad/tea/testarch/tea-index.csv
   ```
2. Verify knowledge fragments:
   ```bash
   ls -la _bmad/tea/testarch/knowledge/
   # Should show 34 .md files
   ```

### Issue: Workflows Producing Different Outputs

**Symptom**: Test designs or reports look different than before

**Solution**: This shouldn't happen - workflows are functionally identical. If you notice differences:

1. Check you're using the same workflow (e.g., `test-design` not `test-review`)
2. Verify knowledge base fragments loaded correctly
3. Check variable configuration matches your previous setup

For additional help, see [docs/reference/troubleshooting.md](/docs/reference/troubleshooting.md) or open an issue on GitHub.

## Benefits of Standalone TEA

### For End Users

- ✅ **Optional Installation**: Only install TEA if you need test architecture guidance
- ✅ **Lighter Weight**: Don't carry TEA's dependencies if you're not using it
- ✅ **Clearer Purpose**: TEA focuses exclusively on test engineering
- ✅ **Faster Updates**: TEA can release independently of BMM

### For Contributors

- ✅ **Focused Codebase**: Work on testing features without BMM complexity
- ✅ **Independent Testing**: Test suite focused only on TEA functionality
- ✅ **Easier Maintenance**: Changes to TEA don't affect BMM and vice versa
- ✅ **Clearer Ownership**: Test engineering contributions go to TEA repo

## Compatibility Matrix

| BMAD Method Version | TEA Version | Compatible? | Notes                               |
| ------------------- | ----------- | ----------- | ----------------------------------- |
| v6.x (legacy)       | Embedded    | ✅          | Old BMM-embedded TEA                |
| v7.0.0+             | 1.0.0+      | ✅          | Standalone TEA module               |
| v7.0.0+             | Embedded    | ❌          | TEA removed from BMM in v7.0.0      |
| v6.x (legacy)       | 1.0.0+      | ❌          | Standalone TEA requires BMM v7.0.0+ |

## Migration Checklist

Use this checklist to ensure a smooth migration:

- [ ] Verify BMAD Method version is v7.0.0 or later
- [ ] Install standalone TEA module via `npx bmad-method install`
- [ ] Configure TEA variables (test_artifacts, Playwright Utils, MCP)
- [ ] Update saved prompts to use new namespace (`/bmad:tea:*`)
- [ ] Update documentation references to new commands
- [ ] Update CI/CD scripts if they invoke TEA commands
- [ ] Test each workflow you use (e.g., `test-design`, `automate`, `atdd`)
- [ ] Verify knowledge base fragments load correctly
- [ ] Confirm output formats match expectations
- [ ] Update team documentation and onboarding guides

## Getting Help

If you encounter issues during migration:

1. **Documentation**: Check [test-architect.bmad-method.org](https://test-architect.bmad-method.org)
2. **Troubleshooting**: See [docs/reference/troubleshooting.md](/docs/reference/troubleshooting.md)
3. **GitHub Issues**: Open an issue at [bmad-code-org/bmad-method-test-architecture-enterprise](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/issues)
4. **Community**: Join discussions in GitHub Discussions

## FAQ

### Do I need to migrate immediately?

**No.** If you're on BMAD Method v6.x with embedded TEA, you can continue using it. However, new features and updates will only be released for standalone TEA (v1.0.0+).

### Can I use both BMM and TEA together?

**Yes!** That's the recommended approach. Install both modules for integrated development and testing workflows.

### Will my old test designs/reports still work?

**Yes.** Output formats remain compatible. You can continue using test designs and reports generated by BMM-embedded TEA.

### What if I don't want to use TEA?

**That's fine!** TEA is now optional. Simply don't install it during BMAD Method setup.

### Is standalone TEA compatible with Playwright Utils?

**Yes.** Standalone TEA has the same Playwright Utils integration as BMM-embedded TEA. Enable it via the `tea_use_playwright_utils` variable during installation.

### Where can I find the old BMM-embedded TEA?

BMM-embedded TEA will remain available in BMAD Method v6.x releases for backwards compatibility. However, it won't receive new features or updates.

---

**Ready to migrate?** Start with [Step 1: Check Current BMAD Version](#step-1-check-current-bmad-version)

**Need help?** See [Troubleshooting](#troubleshooting) or [Getting Help](#getting-help)
