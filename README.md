# TEA: Test Engineering Architect

[![Node Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

**TEA** stands for **Test Engineering Architect**. The npm package and repository slug `bmad-method-test-architecture-enterprise` is a package name and never an expansion of the acronym.

TEA is a standalone BMAD module that delivers risk-based test strategy, test automation guidance, and release gate decisions. It provides a single expert agent (Murat, Master Test Architect and Quality Advisor) and nine workflows spanning Teach Me Testing (TEA Academy), test design, framework setup, CI guidance, ATDD, automation, test review, NFR Evidence Audit, and traceability.

TEA is two layers. **TEA Core** decides what must be verified, at what depth, with what evidence, and whether that evidence is sufficient to release; it assumes nothing about your language, framework, or platform. **Execution targets** turn those decisions into runnable tests on a specific stack, and that layer is swappable. See [Verification Architecture](./docs/explanation/verification-architecture.md) for the split, and [Execution Targets](./docs/reference/execution-targets.md) for exactly which stacks are covered at which depth.

Docs: <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/>

## Why TEA

- Risk-based prioritization (P0-P3) from probability × impact, with measurable quality gates
- Requirements traced to evidence, and PASS / CONCERNS / FAIL / WAIVED release decisions that survive an audit
- NFR thresholds set at design time and audited against real evidence, defaulting to CONCERNS when evidence is missing
- Consistent, knowledge-base driven outputs instead of whatever the model felt like producing
- Stack-aware execution: Playwright and Cypress for browsers, Maestro for mobile native, Pact for contracts, pytest / JUnit / Go test / xUnit / RSpec for backend services, k6 and scanners as NFR evidence

## How BMad Works

BMad works because it turns big, fuzzy work into **repeatable workflows**. Each workflow is broken into small steps with clear instructions, so the AI follows the same path every time. It also uses a **shared knowledge base** (standards and patterns) so outputs are consistent, not random. In short: **structured steps + shared standards = reliable results**.

## How TEA Fits In

TEA plugs into BMad the same way a specialist plugs into a team. It uses the same step‑by‑step workflow engine and shared standards, but focuses exclusively on testing and quality gates. That means you get a **risk‑based test plan**, **automation guidance**, and **go/no‑go decisions** that align with the rest of the BMad process.

## Architecture & Flow

BMad is a small **agent + workflow engine**. There is no external orchestrator; everything runs inside the LLM context window through structured instructions.

### Building Blocks

TEA has two layers of files, and each has a specific job:

| File / Scope                                       | What it does                                                                                                       | When it loads                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `src/agents/bmad-tea/SKILL.md`                     | Murat's persona — identity, principles, critical actions; renders the `{agent.menu}` placeholder                   | First — activates the TEA agent                         |
| `src/agents/bmad-tea/customize.toml`               | Agent customization surface — `[[agent.menu]]` items (two-letter code → skill), persistent facts, activation hooks | During agent activation                                 |
| `src/workflows/testarch/<workflow>/SKILL.md`       | Workflow entrypoint — resolves workflow customization, picks mode, routes to the first step                        | When a TEA workflow is invoked                          |
| `src/workflows/testarch/<workflow>/customize.toml` | Workflow customization surface — activation hooks, persistent facts, optional `on_complete` behavior               | During workflow activation                              |
| `src/workflows/testarch/<workflow>/workflow.yaml`  | Machine-readable workflow metadata — descriptions, defaults, tool hints, output paths                              | Used by installer/tooling and workflow metadata lookups |
| `instructions.md`                                  | Workflow-specific summary and operator notes                                                                       | On demand                                               |
| `steps-c/*.md`                                     | **Create** steps — primary execution, 5-9 sequential files                                                         | One at a time (just-in-time)                            |
| `steps-e/*.md`                                     | **Edit** steps — always 2 files: assess target, apply edit                                                         | One at a time                                           |
| `steps-v/*.md`                                     | **Validate** steps — always 1 file: evaluate against checklist                                                     | On demand                                               |
| `checklist.md`                                     | Validation criteria — what "done" looks like for this workflow                                                     | Read by steps-v                                         |
| `*-template.md`                                    | Output skeleton with `{PLACEHOLDER}` vars — steps fill these in to produce the final artifact                      | Read by steps-c when generating output                  |
| `src/agents/bmad-tea/resources/tea-index.csv`      | Agent-level knowledge fragment index — id, name, tags, tier (core/extended/specialized), file path                 | Read by the TEA agent for direct recommendations        |
| `src/workflows/testarch/<workflow>/resources/`     | Workflow-local knowledge index and fragments                                                                       | Read by workflow steps from that workflow's skill root  |
| `resources/knowledge/*.md`                         | Reusable fragments — standards, patterns, API references                                                           | Selectively read into context based on tier + config    |

Workflow resource directories intentionally duplicate the TEA knowledge base. Each workflow skill must stay self-contained so it can be installed, copied, or invoked without reaching across skill boundaries. When knowledge changes, propagate the intended updates to the affected workflow resource directories instead of replacing them with a central runtime path.

```mermaid
flowchart LR
  U[User] --> A[Agent Persona]
  A --> W[Workflow Entry: workflow SKILL.md]
  W --> S[Step Files: steps-c / steps-e / steps-v]
  S --> K[Knowledge Fragments<br/>tea-index.csv → knowledge/*.md]
  S --> T[Templates & Checklists<br/>*-template.md, checklist.md]
  S --> O[Outputs: docs/tests/reports<br/>when a step writes output]
  O --> V[Validation: checklist + report]
```

### How It Works at Runtime

1. **Trigger** — Direct commands are `/bmad-testarch-automate` (Claude Code, Cursor, Windsurf) and `$bmad-testarch-automate` (Codex). Load the conversational TEA menu with `/bmad-tea` or `$bmad-tea`. `TA` is an agent-menu code available only after TEA is activated; the `[[agent.menu]]` entries in `src/agents/bmad-tea/customize.toml` map `TA` to the `bmad-testarch-automate` skill, and `SKILL.md` renders that menu at runtime from the `{agent.menu}` placeholder.
2. **Step files carry everything after that.** The workflow's `SKILL.md` resolves its `customize.toml` block, picks the mode (Create / Edit / Validate), and routes to the first step; each step loads on its own, pulls only the knowledge fragments its tier and config flags call for (a backend project pulls ~1,800 lines of Playwright Utils fragments; a fullstack project pulls the browser fragments too), fills any `*-template.md` placeholders, and names the next step. Progress lands in the output file's YAML frontmatter (`stepsCompleted`, `lastStep`, `lastSaved`), so an interrupted run resumes at the next incomplete step, and `steps-v/` scores a finished output against `checklist.md`.

See [Step-File Architecture](./docs/explanation/step-file-architecture.md) for the loading model, subagent isolation, and the per-workflow step patterns.

**How workflows become commands.** `npx bmad-method install` copies each TEA skill into your tool's skills directory under its own name: `.claude/skills/` for Claude Code, `.agents/skills/` for Codex, Cursor, and Windsurf. Invoking that name loads the skill, and the step-file process takes over. The installer covers 45 platforms, and the skill name is identical on every one of them.

## Install

```bash
npx bmad-method install
# Select: Test Architect (TEA)
```

**Note:** TEA is automatically added to party mode after installation. Use `/party` to collaborate with TEA alongside other BMad agents.

### Tool-specific invocation

| Tool                            | Invocation style                | Example                                  |
| ------------------------------- | ------------------------------- | ---------------------------------------- |
| Claude Code / Cursor / Windsurf | Slash command                   | `/bmad-testarch-automate`                |
| Codex                           | `$` skill from `.agents/skills` | `$bmad-tea` or `$bmad-testarch-automate` |

## Quickstart

1. Install TEA (above)
2. Load the TEA menu with `/bmad-tea` or `$bmad-tea` if you want a conversational entrypoint.
3. Run one of the core workflows:
   - `TD` / `/bmad-testarch-test-design` / `$bmad-testarch-test-design` — test design, risk assessment, and NFR planning
   - `AT` / `/bmad-testarch-atdd` / `$bmad-testarch-atdd` — failing acceptance tests first (TDD red phase)
   - `TA` / `/bmad-testarch-automate` / `$bmad-testarch-automate` — expand automation coverage
4. Or use in party mode: `/party` to include TEA with other agents

## Engagement Models

- **No TEA**: Use your existing testing approach
- **TEA Solo**: Standalone use on non-BMad projects
- **TEA Lite**: Start with `automate` only for fast onboarding
- **Integrated (BMad Method / Enterprise)**: Use TEA in Phases 3–4 and release gates

## Workflows

| Trigger | Slash Command                | Codex Skill                  | Purpose                                                                     |
| ------- | ---------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| TMT     | `/bmad-teach-me-testing`     | `$bmad-teach-me-testing`     | Teach Me Testing (TEA Academy)                                              |
| TD      | `/bmad-testarch-test-design` | `$bmad-testarch-test-design` | System-level or epic-level test design and NFR planning                     |
| TF      | `/bmad-testarch-framework`   | `$bmad-testarch-framework`   | Scaffold test framework (frontend, backend, fullstack, or mobile)           |
| CI      | `/bmad-testarch-ci`          | `$bmad-testarch-ci`          | Set up CI/CD quality pipeline (multi-platform)                              |
| AT      | `/bmad-testarch-atdd`        | `$bmad-testarch-atdd`        | Generate failing acceptance tests + checklist                               |
| TA      | `/bmad-testarch-automate`    | `$bmad-testarch-automate`    | Expand test automation coverage                                             |
| RV      | `/bmad-testarch-test-review` | `$bmad-testarch-test-review` | Review test quality and score                                               |
| NR      | `/bmad-testarch-nfr`         | `$bmad-testarch-nfr`         | Audit implemented NFR evidence                                              |
| TR      | `/bmad-testarch-trace`       | `$bmad-testarch-trace`       | Trace requirements to tests + gate decision                                 |
| GATE    | agent menu only              | agent menu only              | Route the release gate: test review, NFR evidence audit, then trace Phase 2 |

`GATE` is a routing prompt on the agent menu, so it has no standalone command. Load the agent with `/bmad-tea` or `$bmad-tea` and pick it there.

## Configuration

TEA variables are defined in `src/module.yaml` and prompted during install:

- `test_artifacts` — base output folder for test artifacts
- `tea_use_playwright_utils` — enable Playwright Utils integration (boolean)
- `tea_use_pactjs_utils` — enable Pact.js Utils integration for contract testing when your project explicitly uses Pact (boolean)
- `tea_pact_mcp` — SmartBear MCP for PactFlow/Broker interaction when broker integration is needed: mcp, none (string)
- `tea_browser_automation` — browser automation mode: auto, cli, mcp, none (string)
- `test_framework` — detected or configured test framework (Playwright, Cypress, Jest, Vitest, pytest, JUnit, Go test, dotnet test, RSpec, Maestro)
- `test_stack_type` — detected or configured stack type (frontend, backend, fullstack, mobile)
- `ci_platform` — CI platform (auto, github-actions, gitlab-ci, jenkins, azure-devops, harness, circle-ci)
- `risk_threshold` — risk cutoff for mandatory testing (future)
- `test_design_output`, `test_review_output`, `trace_output` — subfolders under `test_artifacts`

## Knowledge Base

TEA relies on a curated testing knowledge base:

- Index: `src/agents/bmad-tea/resources/tea-index.csv`
- Fragments: `src/agents/bmad-tea/resources/knowledge/`

Workflows load only the fragments required for the current task to stay focused and compliant.

## Module Structure

```text
src/
├── module.yaml
├── agents/
│   └── bmad-tea/
│       ├── SKILL.md
│       ├── customize.toml
│       └── resources/
│           ├── tea-index.csv
│           └── knowledge/
├── workflows/
│   └── testarch/
│       ├── bmad-teach-me-testing/
│       ├── bmad-testarch-atdd/
│       ├── bmad-testarch-automate/
│       ├── bmad-testarch-ci/
│       ├── bmad-testarch-framework/
│       ├── bmad-testarch-nfr/
│       ├── bmad-testarch-test-design/
│       ├── bmad-testarch-test-review/
│       └── bmad-testarch-trace/
```

## Extending TEA

Custom workflows are still compatible with TEA, but they are no longer implicitly absorbed into TEA core. The supported path is:

1. Package the workflow as custom content or a custom module.
2. Attach it to `bmad-tea` using the agent customization flow.
3. Reinstall/update BMAD so the new menu item and workflow are registered.

See [Extend TEA with Custom Workflows](docs/how-to/customization/extend-tea-with-custom-workflows.md) and the BMAD customization guide at [`BMAD-METHOD/docs/how-to/customize-bmad.md`](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/how-to/customize-bmad.md).

## Contributing

See `CONTRIBUTING.md` for guidelines.

---

<details>
<summary><strong>📦 Release Guide (for Maintainers)</strong></summary>

## Publishing TEA to NPM

TEA uses an automated publish workflow modeled after the main `BMAD-METHOD` repo. It supports:

- `next` prereleases published automatically from `main`
- manual stable releases on the `latest` dist-tag
- trusted npm publishing (no `NPM_TOKEN` secret)
- metadata sync for `package.json`, `package-lock.json`, and `.claude-plugin/marketplace.json`

### Prerequisites (One-Time Setup)

1. **npm Trusted Publishing:**
   - In npm package settings for `bmad-method-test-architecture-enterprise`, configure Trusted Publishers for this GitHub repository
   - Allow publishes from the `bmad-code-org/bmad-method-test-architecture-enterprise` repo and the `.github/workflows/publish.yaml` workflow
   - GitHub Actions must be able to request an OIDC token (`id-token: write`), which the workflow already does

2. **GitHub App Secrets for Stable Releases:**
   - Add `RELEASE_APP_ID`
   - Add `RELEASE_APP_PRIVATE_KEY`
   - Install the corresponding GitHub App on this repository with contents write access
   - If `main` is protected, ensure the app is allowed to push the release commit and tag
   - These are used only for manual stable releases so the workflow can push the version bump commit and tag back to `main`

3. **Verify Package Configuration:**
   ```bash
   # Check package.json settings
   cat package.json | grep -A 3 "publishConfig"
   # Should show: "access": "public"
   if grep -Eq '"private"[[:space:]]*:[[:space:]]*true' package.json; then
     echo '❌ package.json must not set "private": true'
   else
     echo '✅ package.json is publishable ("private": true not present)'
   fi
   ```

### Release Process

#### Option 1: Using npm Scripts (Recommended)

From your local terminal after merging to `main`:

```bash
# Publish the next prerelease from current main
npm run release:next

# Publish a stable patch release
npm run release:patch

# Publish a stable minor release
npm run release:minor

# Publish a stable major release
npm run release:major
```

#### Option 2: Manual Workflow Trigger

1. Go to **Actions** tab in GitHub
2. Click **"Publish"** workflow
3. Click **"Run workflow"**
4. Choose the branch to release, typically `main`
5. Select channel:
   - `next` for a prerelease publish
   - `latest` for a stable release
6. If using `latest`, choose the bump type (`patch`, `minor`, `major`)
7. Click **"Run workflow"**

### What Happens Automatically

The workflow performs these steps:

1. ✅ **Validation**: Runs the full `npm test` suite, including schema checks, install tests, knowledge checks, linting, markdown linting, formatting, and release metadata validation
2. ✅ **Version Bump**:
   - `next`: derives the next prerelease version and publishes it with dist-tag `next`
   - `latest`: bumps the stable version (`patch`, `minor`, or `major`)
3. ✅ **Metadata Sync**: Updates `.claude-plugin/marketplace.json` to match the package version before publishing
4. ✅ **Publish**: Publishes to npm with provenance enabled
   - `next` → `npm publish --tag next --provenance`
   - `latest` → `npm publish --tag latest --provenance`
5. ✅ **Stable Release Finalization**: For `latest`, creates a version bump commit, tags it, pushes it to `main`, and creates a GitHub Release

### Channel Strategy

- **`next`**: prerelease channel for the newest merged changes
- **`latest`**: stable channel for intentional releases
- **`patch`**: bug fixes, no breaking changes
- **`minor`**: new features, backwards compatible
- **`major`**: breaking changes

**Recommended Release Path:**

1. Merge releasable work to `main`
2. Let `next` publish for early validation
3. When ready, cut a stable `latest` release via `patch`, `minor`, or `major`

### Verify Publication

**Check NPM:**

```bash
npm view bmad-method-test-architecture-enterprise
npm view bmad-method-test-architecture-enterprise dist-tags
```

**Install TEA:**

```bash
npx bmad-method install
# Select "Test Architect (TEA)"
```

**Test Workflows:** type these in the assistant chat, not in a shell.

```text
/bmad-tea                     # load the agent persona and menu
/bmad-testarch-test-design    # run a workflow directly
```

Codex uses `$` in place of `/`.

### Rollback a Release (if needed)

If you need to unpublish a version:

```bash
# Unpublish specific version (within 72 hours)
npm unpublish bmad-method-test-architecture-enterprise@1.13.2-next.0

# Deprecate version (preferred for older releases)
npm deprecate bmad-method-test-architecture-enterprise@1.13.2-next.0 "Use version X.Y.Z instead"
```

### Troubleshooting

**Trusted publishing failed:**

- Verify npm Trusted Publishing is configured for this repository and workflow
- Verify the workflow has `id-token: write`
- Confirm the publish is running from the canonical repository, not a fork

**"Package already exists":**

- Check if package name is already taken on NPM
- Update `name` in `package.json` if needed

**"Version push failed":**

- Verify `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` are configured
- Verify the GitHub App is installed on this repository with contents write access
- If branch protection is enabled on `main`, verify the app is allowed to push the release commit and tag

**"Tests failed":**

- Fix failing tests before release
- Run `npm test` locally to verify

**"Git push failed (protected branch)":**

- This is not expected once the release GitHub App is configured correctly
- Verify branch protection allows the app to push the release commit and tag
- If needed, create the GitHub Release manually after resolving the app permissions

### Release Checklist

Before releasing:

- [ ] All tests passing: `npm test`
- [ ] Documentation up to date
- [ ] CHANGELOG.md updated
- [ ] No uncommitted changes
- [ ] On `main` branch
- [ ] npm Trusted Publishing configured
- [ ] `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` configured
- [ ] Package name available on NPM

After releasing:

- [ ] Verify NPM publication: `npm view bmad-method-test-architecture-enterprise`
- [ ] Test installation: `npx bmad-method install`
- [ ] Verify workflows work
- [ ] Check GitHub Release created
- [ ] Monitor for issues

</details>

---

## Community

- [Discord](https://discord.gg/gk8jAdXWmj) — Get help, share ideas, collaborate
- [YouTube](https://youtube.com/@BMadCode) — Tutorials, master class, and more
- [X / Twitter](https://x.com/BMadCode)
- [Website](https://bmadcode.com)

## Support BMad

BMad is free for everyone and always will be. Star this repo, [buy me a coffee](https://buymeacoffee.com/bmad), or email [contact@bmadcode.com](mailto:contact@bmadcode.com) for corporate sponsorship.

## License

See `LICENSE`.
