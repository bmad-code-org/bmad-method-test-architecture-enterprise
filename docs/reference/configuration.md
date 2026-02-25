---
title: 'TEA Configuration Reference'
description: Complete reference for TEA configuration options and file locations
---

# TEA Configuration Reference

Complete reference for all TEA (Test Engineering Architect) configuration options.

## Configuration File Locations

### User Configuration (Installer-Generated)

**Location:** `_bmad/tea/config.yaml`

**Purpose:** Project-specific configuration values for your repository

**Created By:** BMad installer

**Status:** Typically gitignored (user-specific values)

**Usage:** Edit this file to change TEA behavior in your project

**Example:**

```yaml
# _bmad/tea/config.yaml
project_name: my-awesome-app
user_skill_level: intermediate
output_folder: _bmad-output
test_artifacts: _bmad-output/test-artifacts
tea_use_playwright_utils: true
tea_use_pactjs_utils: true
tea_pact_mcp: 'mcp'
tea_browser_automation: 'auto'
```

### Canonical Schema (Source of Truth)

**Location:** `src/module.yaml`

**Purpose:** Defines available configuration keys, defaults, and installer prompts

**Created By:** BMAD maintainers (part of BMAD repo)

**Status:** Versioned in BMAD repository

**Usage:** Reference only (do not edit unless contributing to BMAD)

**Note:** The installer reads `module.yaml` to prompt for config values, then writes user choices to `_bmad/tea/config.yaml` in your project.

---

## TEA Configuration Options

### test_artifacts

Base output folder for TEA-generated artifacts (test designs, reports, traceability, etc).

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `{output_folder}/test-artifacts`

**Purpose:** Allows TEA outputs to live outside the core BMM output folder.

**Example:**

```yaml
test_artifacts: docs/testing-artifacts
```

### tea_use_playwright_utils

Enable Playwright Utils integration for production-ready fixtures and utilities.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `boolean`

**Default:** `true`

**Installer Prompt:**

```
Enable Playwright Utils integration?
```

**Purpose:** Enables TEA to:

- Include playwright-utils in `framework` scaffold
- Generate tests using playwright-utils fixtures
- Review tests against playwright-utils patterns
- Configure CI with burn-in and selective testing utilities

**Affects Workflows:**

- `framework` - Includes playwright-utils imports and fixture examples
- `atdd` - Uses fixtures like `apiRequest`, `authSession` in generated tests
- `automate` - Leverages utilities for test patterns
- `test-review` - Reviews against playwright-utils best practices
- `ci` - Includes burn-in utility and selective testing

**Example (Enable):**

```yaml
tea_use_playwright_utils: true
```

**Example (Disable):**

```yaml
tea_use_playwright_utils: false
```

**Prerequisites:**

```bash
npm install -D @seontechnologies/playwright-utils
```

**Related:**

- [Integrate Playwright Utils Guide](/docs/how-to/customization/integrate-playwright-utils.md)
- [Playwright Utils on npm](https://www.npmjs.com/package/@seontechnologies/playwright-utils)

---

### tea_use_pactjs_utils

Enable Pact.js Utils integration for production-ready contract testing utilities.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `boolean`

**Default:** `false`

**Installer Prompt:**

```
Enable Pact.js Utils integration for contract testing?
```

**Purpose:** Enables TEA to:

- Load Pact.js Utils knowledge fragments during context loading
- Scaffold contract test structure and examples in `framework`
- Generate contract testing guidance in `atdd` and `automate`
- Review provider verification patterns in `test-review`
- Add contract pipeline stage and gates in `ci`

**Affects Workflows:**

- `framework` - Creates pact test folders and pactjs-utils sample patterns
- `atdd` - Loads pactjs-utils fragments for contract-aware generation context
- `automate` - Loads pactjs-utils fragments and passes pact config to subprocesses
- `test-design` - Loads pactjs-utils fragments for system/epic planning
- `test-review` - Uses pactjs-utils provider/review patterns
- `ci` - Adds contract-test stage and quality gates

**Example (Enable):**

```yaml
tea_use_pactjs_utils: true
```

**Example (Disable):**

```yaml
tea_use_pactjs_utils: false
```

**Prerequisites:**

```bash
npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
```

**Related:**

- [Pact.js Utils docs](https://seontechnologies.github.io/pactjs-utils/)
- [TEA Overview - Optional Integrations](/docs/explanation/tea-overview.md#optional-integrations)

---

### tea_pact_mcp

Pact MCP strategy for broker interaction during contract testing workflows.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `"none"`

**Options:** `"mcp"` | `"none"`

**Installer Prompt:**

```
Enable SmartBear MCP for PactFlow/Pact Broker interaction?
```

**Purpose:** Controls whether TEA can use SmartBear MCP tools for:

- Provider-state discovery in design/generation workflows
- Pact test review assistance
- Can-i-deploy and matrix guidance in CI workflows

**Affects Workflows:**

- `test-design` - Broker-aware contract context loading
- `automate` - Broker-assisted pact generation context
- `test-review` - MCP-assisted pact review context
- `ci` - MCP can-i-deploy/matrix guidance references

**Prerequisites:**

```bash
npm install -g @smartbear/mcp
# or: npx -y @smartbear/mcp@latest
```

**Required broker env vars (for Pact features):**

- `PACT_BROKER_BASE_URL`
- `PACT_BROKER_TOKEN` (or username/password for basic auth)

**Example (Enable MCP):**

```yaml
tea_pact_mcp: 'mcp'
```

**Example (Disable MCP):**

```yaml
tea_pact_mcp: 'none'
```

**Related:**

- [Configure Browser Automation Guide](/docs/how-to/customization/configure-browser-automation.md)
- [SmartBear MCP docs](https://developer.smartbear.com/smartbear-mcp/docs/getting-started)

---

### tea_browser_automation

Browser automation strategy for TEA workflows. Controls how TEA interacts with live browsers during test generation.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `"auto"`

**Options:** `"auto"` | `"cli"` | `"mcp"` | `"none"`

**Installer Prompt:**

```
How should TEA interact with browsers during test generation?
```

**Purpose:** Controls which browser automation tool TEA uses:

| Mode   | Behavior                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| `auto` | Smart selection — CLI for stateless tasks, MCP for stateful flows. Falls back gracefully. **(Recommended)** |
| `cli`  | CLI only (`@playwright/cli`). MCP ignored.                                                                  |
| `mcp`  | MCP only. CLI ignored. Same as old `tea_use_mcp_enhancements: true`.                                        |
| `none` | No browser interaction. Pure AI generation from docs/code.                                                  |

**Affects Workflows:**

- `test-design` - Exploratory mode (CLI snapshots for page discovery)
- `atdd` - Recording mode (CLI for selector verification, MCP for complex interactions)
- `automate` - Healing mode (MCP for debugging) + recording mode (CLI for snapshots)
- `test-review` - Evidence collection (CLI for traces, screenshots)

**Prerequisites:**

- **CLI:** `npm install -g @playwright/cli@latest` then `playwright-cli install --skills`
- **MCP:** Configure MCP servers in IDE (see [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md))

**Example (Auto — Recommended):**

```yaml
tea_browser_automation: 'auto'
```

**Example (CLI only):**

```yaml
tea_browser_automation: 'cli'
```

**Example (MCP only — same as old behavior):**

```yaml
tea_browser_automation: 'mcp'
```

**Example (Disable):**

```yaml
tea_browser_automation: 'none'
```

**Migration from old flag:**

| Old Setting                       | New Equivalent                   |
| --------------------------------- | -------------------------------- |
| `tea_use_mcp_enhancements: true`  | `tea_browser_automation: "auto"` |
| `tea_use_mcp_enhancements: false` | `tea_browser_automation: "none"` |

**Related:**

- [Configure Browser Automation Guide](/docs/how-to/customization/configure-browser-automation.md)
- [TEA Overview - Browser Automation](/docs/explanation/tea-overview.md#browser-automation-playwright-cli-mcp)

---

### test_stack_type

Detected or configured project stack type. Controls CI pipeline generation and framework selection.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `"auto"`

**Options:** `"auto"` | `"frontend"` | `"backend"` | `"fullstack"`

**Purpose:** Determines stack-specific behavior:

| Stack Type  | Behavior                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `auto`      | Auto-detect from project manifests (playwright.config, jest.config, etc.)                                  |
| `frontend`  | Browser-based tests (Playwright/Cypress), browser install in CI, burn-in enabled                           |
| `backend`   | API/unit tests (pytest, JUnit, Go test, Jest/Vitest, etc.), no browser install, burn-in skipped by default |
| `fullstack` | Both frontend and backend tests, full CI pipeline                                                          |

**Affects Workflows:**

- `ci` - Stack-conditional pipeline stages (browser install, burn-in)
- `framework` - Framework scaffold adapts to stack type

**Example:**

```yaml
test_stack_type: 'fullstack'
```

---

### ci_platform

CI/CD platform for pipeline generation.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `"auto"`

**Options:** `"auto"` | `"github-actions"` | `"gitlab-ci"` | `"jenkins"` | `"azure-devops"` | `"harness"` | `"circle-ci"` | `"other"`

**Purpose:** Controls which CI template is used for pipeline generation.

When set to `"auto"`, TEA detects the platform by scanning for existing CI configuration files (`.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.harness/`, `.circleci/config.yml`) and falls back to inferring from the git remote.

**Affects Workflows:**

- `ci` - Template selection and output path

**Example:**

```yaml
ci_platform: 'github-actions'
```

---

### test_framework

Detected or configured test framework preference.

**Schema Location:** `src/module.yaml` (TEA module config)

**User Config:** `_bmad/tea/config.yaml`

**Type:** `string`

**Default:** `"auto"`

**Options:** `"auto"` | `"playwright"` | `"cypress"` | `"jest"` | `"vitest"` | `"pytest"` | `"junit"` | `"go-test"` | `"dotnet-test"` | `"rspec"` | `"other"`

**Purpose:** Controls which test framework patterns TEA uses for code generation. When set to `"auto"`, TEA detects from project configuration files and manifests. Supports both frontend (Playwright, Cypress, Jest, Vitest) and backend (pytest, JUnit, Go test, dotnet test, RSpec) frameworks.

**Affects Workflows:**

- `framework` - Scaffold generation
- `ci` - Test commands in pipeline
- `atdd` - Test code generation patterns
- `automate` - Test code generation patterns

**Example:**

```yaml
test_framework: 'playwright'
```

---

## Core BMM Configuration (Inherited by TEA)

TEA also uses core BMM configuration options from `_bmad/tea/config.yaml`:

### output_folder

**Type:** `string`

**Default:** `_bmad-output`

**Purpose:** Base output folder for core BMM artifacts. TEA writes test artifacts under `test_artifacts` (defaults to `{output_folder}/test-artifacts`).

**Example:**

```yaml
output_folder: _bmad-output
```

**TEA Output Files (under `{test_artifacts}`):**

- `test-design-architecture.md` + `test-design-qa.md` (from `test-design` system-level - TWO documents)
- `test-design-epic-N.md` (from `test-design` epic-level)
- `test-review.md` (from `test-review`)
- `traceability-matrix.md` (from `trace` Phase 1)
- `gate-decision-{gate_type}-{story_id}.md` (from `trace` Phase 2)
- `nfr-assessment.md` (from `nfr-assess`)
- `automation-summary.md` (from `automate`)
- `atdd-checklist-{story_id}.md` (from `atdd`)

---

### user_skill_level

**Type:** `enum`

**Options:** `beginner` | `intermediate` | `expert`

**Default:** `intermediate`

**Purpose:** Affects how TEA explains concepts in chat responses

**Example:**

```yaml
user_skill_level: beginner
```

**Impact on TEA:**

- **Beginner:** More detailed explanations, links to concepts, verbose guidance
- **Intermediate:** Balanced explanations, assumes basic knowledge
- **Expert:** Concise, technical, minimal hand-holding

---

### project_name

**Type:** `string`

**Default:** Directory name

**Purpose:** Used in TEA-generated documentation and reports

**Example:**

```yaml
project_name: my-awesome-app
```

**Used in:**

- Report headers
- Documentation titles
- CI configuration comments

---

### communication_language

**Type:** `string`

**Default:** `english`

**Purpose:** Language for TEA chat responses

**Example:**

```yaml
communication_language: english
```

**Supported:** Any language (TEA responds in specified language)

---

### document_output_language

**Type:** `string`

**Default:** `english`

**Purpose:** Language for TEA-generated documents (test designs, reports)

**Example:**

```yaml
document_output_language: english
```

**Note:** Can differ from `communication_language` - chat in Spanish, generate docs in English.

---

## Environment Variables

TEA workflows may use environment variables for test configuration.

### Test Framework Variables

**Playwright:**

```bash
# .env
BASE_URL=https://todomvc.com/examples/react/dist/
API_BASE_URL=https://api.example.com
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=password123
```

**Cypress:**

```bash
# cypress.env.json or .env
CYPRESS_BASE_URL=https://example.com
CYPRESS_API_URL=https://api.example.com
```

### CI/CD Variables

Set in CI platform (GitHub Actions secrets, GitLab CI variables):

```yaml
# .github/workflows/test.yml
env:
  BASE_URL: ${{ secrets.STAGING_URL }}
  API_KEY: ${{ secrets.API_KEY }}
  TEST_USER_EMAIL: ${{ secrets.TEST_USER }}
```

---

## Configuration Patterns

### Development vs Production

**Separate configs for environments:**

```yaml
# _bmad/tea/config.yaml
output_folder: _bmad-output

# .env.development
BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000

# .env.staging
BASE_URL=https://staging.example.com
API_BASE_URL=https://api-staging.example.com

# .env.production (read-only tests only!)
BASE_URL=https://example.com
API_BASE_URL=https://api.example.com
```

### Team vs Individual

**Team config (committed):**

```yaml
# _bmad/tea/config.yaml.example (committed to repo)
project_name: team-project
output_folder: _bmad-output
tea_use_playwright_utils: true
tea_browser_automation: 'none'
```

**Individual config (typically gitignored):**

```yaml
# _bmad/tea/config.yaml (user adds to .gitignore)
user_name: John Doe
user_skill_level: expert
tea_browser_automation: 'auto' # Individual preference
```

### Monorepo Configuration

**Root config:**

```yaml
# _bmad/tea/config.yaml (root)
project_name: monorepo-parent
output_folder: _bmad-output
```

**Package-specific:**

```yaml
# packages/web-app/_bmad/tea/config.yaml
project_name: web-app
output_folder: ../../_bmad-output/web-app
tea_use_playwright_utils: true

# packages/mobile-app/_bmad/tea/config.yaml
project_name: mobile-app
output_folder: ../../_bmad-output/mobile-app
tea_use_playwright_utils: false
```

---

## Configuration Best Practices

### 1. Use Version Control Wisely

**Commit:**

```
_bmad/tea/config.yaml.example    # Template for team
.nvmrc                            # Node version
package.json                      # Dependencies
```

**Recommended for .gitignore:**

```
_bmad/tea/config.yaml            # User-specific values
.env                              # Secrets
.env.local                        # Local overrides
```

### 2. Document Required Setup

**In your README:**

```markdown
## Setup

1. Install BMad

2. Copy config template:
   cp \_bmad/tea/config.yaml.example \_bmad/tea/config.yaml

3. Edit config with your values:
   - Set user_name
   - Enable tea_use_playwright_utils if using playwright-utils
   - Set tea_browser_automation mode (auto, cli, mcp, or none)
```

### 3. Validate Configuration

**Check config is valid:**

```bash
# Check TEA config is set
cat _bmad/tea/config.yaml | grep tea_use

# Verify playwright-utils installed (if enabled)
npm list @seontechnologies/playwright-utils

# Verify MCP servers configured (if enabled)
# Check your IDE's MCP settings
```

### 4. Keep Config Minimal

**Don't over-configure:**

```yaml
# ❌ Bad - overriding everything unnecessarily
project_name: my-project
user_name: John Doe
user_skill_level: expert
output_folder: custom/path
planning_artifacts: custom/planning
implementation_artifacts: custom/implementation
project_knowledge: custom/docs
tea_use_playwright_utils: true
tea_browser_automation: "auto"
communication_language: english
document_output_language: english
# Overriding 11 config options when most can use defaults

# ✅ Good - only essential overrides
tea_use_playwright_utils: true
output_folder: docs/testing
# Only override what differs from defaults
```

**Use defaults when possible** - only override what you actually need to change.

---

## Troubleshooting

### Configuration Not Loaded

**Problem:** TEA doesn't use my config values.

**Causes:**

1. Config file in wrong location
2. YAML syntax error
3. Typo in config key

**Solution:**

```bash
# Check file exists
ls -la _bmad/tea/config.yaml

# Validate YAML syntax
npm install -g js-yaml
js-yaml _bmad/tea/config.yaml

# Check for typos (compare to module.yaml)
diff _bmad/tea/config.yaml src/bmm/module.yaml
```

### Playwright Utils Not Working

**Problem:** `tea_use_playwright_utils: true` but TEA doesn't use utilities.

**Causes:**

1. Package not installed
2. Config file not saved
3. Workflow run before config update

**Solution:**

```bash
# Verify package installed
npm list @seontechnologies/playwright-utils

# Check config value
grep tea_use_playwright_utils _bmad/tea/config.yaml

# Re-run workflow in fresh chat
# (TEA loads config at workflow start)
```

### Browser Automation Not Working

**Problem:** `tea_browser_automation` set to `"auto"` or `"cli"` or `"mcp"` but no browser opens.

**Causes:**

1. CLI not installed globally (for `cli` or `auto` mode)
2. MCP servers not configured in IDE (for `mcp` or `auto` mode)
3. Browser binaries missing

**Solution:**

```bash
# For CLI mode: verify CLI is installed
playwright-cli --version

# For MCP mode: check MCP package available
npx @playwright/mcp@latest --version

# Install browsers
npx playwright install

# Verify IDE MCP config (for MCP mode)
# Check ~/.cursor/config.json or VS Code settings
```

### Config Changes Not Applied

**Problem:** Updated config but TEA still uses old values.

**Cause:** TEA loads config at workflow start.

**Solution:**

1. Save `_bmad/tea/config.yaml`
2. Start fresh chat
3. Run TEA workflow
4. Config will be reloaded

**TEA doesn't reload config mid-chat** - always start fresh chat after config changes.

---

## Configuration Examples

### Recommended Setup (Full Stack)

```yaml
# _bmad/tea/config.yaml
project_name: my-project
user_skill_level: beginner # or intermediate/expert
output_folder: _bmad-output
tea_use_playwright_utils: true # Recommended
tea_use_pactjs_utils: true # Recommended - production-ready contract testing utilities
tea_pact_mcp: 'mcp' # Recommended - SmartBear MCP for PactFlow/Broker interaction
tea_browser_automation: 'auto' # Recommended
```

**Why recommended:**

- Playwright Utils: Production-ready fixtures and utilities
- Pact.js Utils: Optional contract-testing acceleration for backend/fullstack services
- Browser automation (auto): Smart CLI/MCP selection with fallback
- Together: The three-part stack (see [Testing as Engineering](/docs/explanation/testing-as-engineering.md))

**Prerequisites:**

```bash
npm install -D @seontechnologies/playwright-utils
# Optional contract-testing stack:
# npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
# npm install -g @smartbear/mcp
npm install -g @playwright/cli@latest  # For CLI mode
# Configure MCP servers in IDE (see Configure Browser Automation guide)
```

**Best for:** Everyone (beginners learn good patterns from day one)

---

### Minimal Setup (Learning Only)

```yaml
# _bmad/tea/config.yaml
project_name: my-project
output_folder: _bmad-output
tea_use_playwright_utils: false
tea_use_pactjs_utils: false
tea_pact_mcp: 'none'
tea_browser_automation: 'none'
```

**Best for:**

- First-time TEA users (keep it simple initially)
- Quick experiments
- Learning basics before adding integrations

**Note:** Can enable integrations later as you learn

---

### Monorepo Setup

**Root config:**

```yaml
# _bmad/tea/config.yaml (root)
project_name: monorepo
output_folder: _bmad-output
tea_use_playwright_utils: true
tea_use_pactjs_utils: true
tea_pact_mcp: 'mcp'
```

**Package configs:**

```yaml
# apps/web/_bmad/tea/config.yaml
project_name: web-app
output_folder: ../../_bmad-output/web

# apps/api/_bmad/tea/config.yaml
project_name: api-service
output_folder: ../../_bmad-output/api
tea_use_playwright_utils: false  # Using vanilla Playwright only
tea_use_pactjs_utils: true       # API service uses contract testing utilities
tea_pact_mcp: 'mcp'              # Optional broker interaction via MCP
```

---

### Team Template

**Commit this template:**

```yaml
# _bmad/tea/config.yaml.example
# Copy to config.yaml and fill in your values

project_name: your-project-name
user_name: Your Name
user_skill_level: intermediate # beginner | intermediate | expert
output_folder: _bmad-output
planning_artifacts: _bmad-output/planning-artifacts
implementation_artifacts: _bmad-output/implementation-artifacts
project_knowledge: docs

# TEA Configuration (Recommended: Enable both for full stack)
tea_use_playwright_utils: true # Recommended - production-ready utilities
tea_use_pactjs_utils: true # Recommended - production-ready contract testing utilities
tea_pact_mcp: 'mcp' # Recommended - SmartBear MCP for broker integration
tea_browser_automation: 'auto' # Recommended - smart CLI/MCP selection

# Languages
communication_language: english
document_output_language: english
```

**Team instructions:**

```markdown
## Setup for New Team Members

1. Clone repo
2. Copy config template:
   cp \_bmad/tea/config.yaml.example \_bmad/tea/config.yaml
3. Edit with your name and preferences
4. Install dependencies:
   npm install
5. (Optional) Enable playwright-utils:
   npm install -D @seontechnologies/playwright-utils
   Set tea_use_playwright_utils: true
6. (Optional) Enable pactjs-utils:
   npm install -D @seontechnologies/pactjs-utils @pact-foundation/pact
   Set tea_use_pactjs_utils: true
7. (Optional) Enable Pact MCP:
   npm install -g @smartbear/mcp
   Set tea_pact_mcp: 'mcp'
```

---

## See Also

### How-To Guides

- [Set Up Test Framework](/docs/how-to/workflows/setup-test-framework.md)
- [Integrate Playwright Utils](/docs/how-to/customization/integrate-playwright-utils.md)
- [Configure Browser Automation](/docs/how-to/customization/configure-browser-automation.md)

### Reference

- [TEA Command Reference](/docs/reference/commands.md)
- [Knowledge Base Index](/docs/reference/knowledge-base.md)
- [Glossary](/docs/glossary/index.md)

### Explanation

- [TEA Overview](/docs/explanation/tea-overview.md)
- [Testing as Engineering](/docs/explanation/testing-as-engineering.md)

---

Generated with [BMad Method](https://bmad-method.org) - TEA (Test Engineering Architect)
