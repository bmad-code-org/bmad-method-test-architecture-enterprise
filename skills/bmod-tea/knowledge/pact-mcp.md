# Pact MCP Server (SmartBear)

## Principle

Use the SmartBear MCP server to give TEA live, read-only knowledge of a PactFlow or Pact Broker workspace: which provider states exist, which pacticipants depend on a provider, what the verification matrix says, and whether a version can deploy. TEA writes, reviews and gates contract tests itself; the broker supplies facts those decisions rest on.

## Rationale

### Why MCP for contract testing?

- **Live broker queries**: provider states, verification results, deployed versions and the integration network come straight from the workspace instead of being guessed from consumer code
- **Deployment safety**: `can-i-deploy` and the matrix can be queried while designing a pipeline or diagnosing a failed gate
- **Blast radius**: the pacticipant network shows every consumer of a provider, which feeds risk scoring in test design

### When TEA uses it

- **test-design workflow**: provider states and the pacticipant network inform contract scope and risk
- **automate workflow**: existing provider states and exact pacticipant names shape generated consumer tests
- **test-review workflow**: provider states and verification results check that reviewed tests match the broker
- **ci workflow**: can-i-deploy, matrix and deployed-version queries inform pipeline gates and failure diagnosis

## Tool Names

Every Pact tool the server registers carries the `contract-testing_` prefix. Clients add their own server prefix in front, so Claude Code shows `mcp__smartbear__contract-testing_can_i_deploy` for a server registered as `smartbear`. Match on the `contract-testing_` part.

`@smartbear/mcp` 0.44.0 registers 104 `contract-testing_*` tools. 61 carry `readOnlyHint: true`, 15 carry `destructiveHint: true`, and the rest write to the workspace: publishing, recording deployments, webhooks, secrets, labels, environments, and an `admin_*` family that manages users, roles, teams, system accounts and API tokens. Names change between server releases, so read them from the session's tool list rather than from memory.

## Tools TEA Calls

All of these are read-only.

| Tool                                                                | Purpose                                                                    | Used in                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| `contract-testing_get_provider_states`                              | Provider states already defined for a provider                             | test-design, automate, test-review |
| `contract-testing_list_pacticipants`                                | Exact pacticipant names as registered                                      | automate, ci                       |
| `contract-testing_get_pacticipant_network`                          | Every consumer and provider connected to a pacticipant                     | test-design (risk, blast radius)   |
| `contract-testing_list_integrations`                                | All consumer-provider pairs in the workspace                               | test-design                        |
| `contract-testing_get_pacts_for_verification`                       | Pacts a provider build would verify for given selectors                    | ci, test-review                    |
| `contract-testing_can_i_deploy`                                     | Whether a version is safe to deploy to an environment                      | ci                                 |
| `contract-testing_matrix`                                           | Verification results between consumer and provider versions                | ci, test-review                    |
| `contract-testing_list_environments`                                | Environment names and UUIDs                                                | ci                                 |
| `contract-testing_get_currently_deployed_versions`                  | What runs in an environment now                                            | ci                                 |
| `contract-testing_get_currently_supported_versions`                 | Released versions still supported (mobile apps, libraries)                 | ci                                 |
| `contract-testing_get_metrics`, `contract-testing_get_team_metrics` | Workspace and team adoption figures (team metrics are PactFlow Cloud only) | reporting                          |

List tools page their results: `contract-testing_get_provider_states`, `contract-testing_get_pacticipant_network` and `contract-testing_get_currently_deployed_versions` return 5 rows per page by default. Raise `pageSize` or follow `pageNumber` until a page comes back short; reading only the first page silently drops provider states and consumers. `contract-testing_matrix` takes `latestby: "cvpv"` for a two-selector query and `"cvp"` for one.

## Safety Rules

### Read-only by default

TEA calls only tools whose `readOnlyHint` is true. Publishing contracts, recording deployments or releases, creating or deleting pacticipants, branches, environments, webhooks, secrets or labels, executing webhooks, and every `admin_*` tool change shared state that other teams' pipelines depend on. Those belong in CI, driven by the Pact CLI or the pipeline the ci workflow generates.

TEA calls a write tool only when the user asks for that specific change in the current conversation, names the target, and confirms. A workflow step never decides to write on its own, and a headless run never writes.

Recommend a read-only API token for agent use. A read/write token exposes every write and `admin_*` tool to the agent session.

### PactFlow AI tools need an explicit request

`contract-testing_generate_pact_tests` and `contract-testing_review_pact_tests` are PactFlow Cloud features. Each call sends the supplied code, specs or test files to the hosted service and spends the workspace's PactFlow AI credits. TEA generates and reviews contract tests with its own knowledge fragments, so it does not call either tool unless the user asks for PactFlow AI output.

When the user does ask:

- Fetch provider states first and pass them in, so generated tests reuse existing state names.
- Treat the output as a draft. It must still pass the provider scrutiny checklist in `contract-testing.md` and, when `tea_use_pactjs_utils` is active, the substitutions in `pactjs-utils-mandate.md`.
- On a 401 or a credit error, call `contract-testing_check_pactflow_ai_entitlements` once and report what it says.

## Installation

### Config file locations

| Tool              | Global Config File                    | Format                 |
| ----------------- | ------------------------------------- | ---------------------- |
| Claude Code       | `~/.claude.json`                      | JSON (`mcpServers`)    |
| Codex             | `~/.codex/config.toml`                | TOML (`[mcp_servers]`) |
| Gemini CLI        | `~/.gemini/settings.json`             | JSON (`mcpServers`)    |
| Cursor            | `~/.cursor/mcp.json`                  | JSON (`mcpServers`)    |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json` | JSON (`mcpServers`)    |
| VS Code (Copilot) | `.vscode/mcp.json`                    | JSON (`servers`)       |

> **Claude Code tip**: Prefer the `claude mcp add` CLI over manual JSON editing. Use `-s user` for global (all projects) or omit for per-project (default).

### CLI shortcuts (Claude Code and Codex)

```bash
# Claude Code — use add-json for servers with env vars (-s user = global)
claude mcp add-json -s user smartbear \
  '{"type":"stdio","command":"npx","args":["-y","@smartbear/mcp@latest"],"env":{"PACT_BROKER_BASE_URL":"https://{tenant}.pactflow.io","PACT_BROKER_TOKEN":"<your-token>"}}'

# Codex
codex mcp add smartbear -- npx -y @smartbear/mcp@latest
```

### JSON config (Gemini CLI, Cursor, Windsurf)

Add a `"smartbear"` entry to the `mcpServers` object in the config file for your tool:

```json
{
  "mcpServers": {
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

### Codex TOML config

Codex uses TOML instead of JSON. Add to `~/.codex/config.toml`:

```toml
[mcp_servers.smartbear]
command = "npx"
args = ["-y", "@smartbear/mcp@latest"]

[mcp_servers.smartbear.env]
PACT_BROKER_BASE_URL = "https://{tenant}.pactflow.io"
PACT_BROKER_TOKEN = "<your-api-token>"
```

Note the key is `mcp_servers` (underscored), not `mcpServers`.

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` (note: uses `servers` key, not `mcpServers`):

```json
{
  "servers": {
    "smartbear": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@smartbear/mcp@latest"],
      "env": {
        "PACT_BROKER_BASE_URL": "https://{tenant}.pactflow.io",
        "PACT_BROKER_TOKEN": "${input:pactToken}"
      }
    }
  }
}
```

> **Note**: Set either `PACT_BROKER_TOKEN` (for PactFlow) or `PACT_BROKER_USERNAME`+`PACT_BROKER_PASSWORD` (for self-hosted). Leave unused vars empty.

## Required Environment Variables

| Variable               | Required                     | Description                             |
| ---------------------- | ---------------------------- | --------------------------------------- |
| `PACT_BROKER_BASE_URL` | Yes (for Pact features)      | PactFlow or self-hosted Pact Broker URL |
| `PACT_BROKER_TOKEN`    | For PactFlow / token auth    | API token for broker authentication     |
| `PACT_BROKER_USERNAME` | For basic auth (self-hosted) | Username for basic authentication       |
| `PACT_BROKER_PASSWORD` | For basic auth (self-hosted) | Password for basic authentication       |

**Authentication**: Use token auth (`PACT_BROKER_TOKEN`) for PactFlow. Use basic auth (`PACT_BROKER_USERNAME` + `PACT_BROKER_PASSWORD`) for self-hosted Pact Broker instances. Only one auth method is needed.

**Requirements**: Node.js 20+

## Pattern Examples

### Example 1: Provider States During Test Design

```text
# → contract-testing_get_provider_states  provider="SampleMoviesAPI"
# ← ["movie with id 1 exists", "no movies exist", "user is authenticated"]
#
# Consumer tests reuse these names exactly; a new state is proposed to the provider team, never invented silently.
```

### Example 2: Blast Radius for Risk Scoring

```text
# → contract-testing_get_pacticipant_network  pacticipantName="SampleMoviesAPI"
# ← consumers: movie-web, movie-mobile, recommendations-service
#
# A breaking change to this provider touches three consumers; impact scores reflect that.
```

### Example 3: Diagnosing a Failed can-i-deploy

```text
# → contract-testing_can_i_deploy  pacticipant="movie-web" version="${GITHUB_SHA}" environment="production"
# ← ok: false, "no verified pact between movie-web and the version of SampleMoviesAPI in production"
#
# → contract-testing_list_environments                       (find the production UUID)
# → contract-testing_get_currently_deployed_versions         environmentId=<uuid>
# → contract-testing_matrix  q=[{pacticipant:"movie-web", version:"${GITHUB_SHA}"},
#                               {pacticipant:"SampleMoviesAPI", environment:"production"}]
#                            latestby="cvpv"
```

Read the matrix result:

| Matrix result                                                      | Meaning                                                    | Fix                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| No row                                                             | The deployed provider never verified this consumer version | Add `{ deployedOrReleased: true }` to the provider's consumer version selectors |
| Row whose verification result is `success: false`                  | Verification ran and failed: a real contract break         | Fix the consumer expectation or the provider                                    |
| Row whose verification result is `success: true`, gate still fails | Another integration of the same pacticipant is unverified  | Repeat the matrix query for each integration                                    |
| Provider version absent from the environment                       | The deployment was never recorded                          | Record it from the deploy pipeline with `pact-broker record-deployment`         |

## When the Tools Are Not Reachable

`tea_pact_mcp` defaults to `"mcp"`, so every contract-testing step reaches this fragment on a normal install. Most installs have no broker. That is expected, and it must cost nothing.

### The probe is a tool-list check, never a broker call

Reachability means **at least one tool whose name contains `contract-testing_` is present in this session's tool list**. Nothing else. Do not call `contract-testing_can_i_deploy`, `contract-testing_matrix`, or any other tool to discover whether the broker answers: a missing server is instant and free to detect, while a misconfigured or unreachable broker is a network round trip that can hang the step. The two failure modes have very different costs and only the free one is worth probing for.

Credentials are likewise not probed. `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN` being unset is a reason the first real tool call will fail, not a reason to make one.

### Probe once per run

Record the result in run state as `pact_mcp_reachable` the first time any step needs it, and have every later step read that value instead of probing again. A run that touches test design, generation, and review must not ask three times, and "probe once" is only true if the answer is stored.

### Fallback order, in this order

1. **Provider source.** Route handlers, types, DTOs, validation schemas. Most authoritative.
2. **An OpenAPI or Swagger spec** (`openapi.yaml`, `openapi.json`, `swagger.json`) when provider source is not readable.
3. **Neither available:** apply `confidence-gate.md`. Stop and ask. Do not invent a provider state, a status code, or a response shape.

There is no fourth branch, and inference is not one of the three.

### What the output must say

State it once per run, in the workflow summary, in this form:

`Pact broker: unreachable (SmartBear MCP tools not available). Provider states derived from <provider source | OpenAPI spec>.`

Then continue. Specifically:

- **Never block a workflow** on the broker. A missing broker is not a HALT condition.
- **Never retry.** One probe, one answer, no loop and no backoff.
- **Never present inferred data as broker data.** A provider state read from a handler is provider-sourced; saying or implying it came from the broker misrepresents its authority, and a contract built on that is worse than one built on an acknowledged guess.
- **`tea_pact_mcp: "none"`** skips the probe entirely. Treat it as "unreachable" without the check and without the report line: the user already said not to look.

Everything above applies to the tools in this fragment only. It has no bearing on whether a Pact suite belongs in the project at all — that is the relevance gate in `pactjs-utils-mandate.md`.

## Key Points

- **Per-project install recommended**: Different projects may target different PactFlow tenants — match TEA's per-project config philosophy
- **Env vars are project-specific**: `PACT_BROKER_BASE_URL` and `PACT_BROKER_TOKEN` vary by project/team
- **Node.js 20+ required**: SmartBear MCP server requires Node.js 20 or higher
- **PactFlow Cloud features**: PactFlow AI generation and review, bi-directional contract testing queries, team metrics and the `admin_*` tools need PactFlow Cloud; a self-hosted Pact Broker exposes the rest
- **Read-only token for agents**: a read/write token hands every write and admin tool to the session
- **Complements pactjs-utils**: MCP provides broker interaction during design/review; pactjs-utils provides runtime utilities for test code

## Related Fragments

- `pactjs-utils-overview.md` — runtime utilities that pact tests import
- `pactjs-utils-provider-verifier.md` — verifier options that reference broker config
- `pact-broker-webhooks.md` — PactFlow → GitHub webhook auth pattern and staleness monitoring; `contract-testing_get_metrics` and `contract-testing_matrix` are useful here for dashboards
- `contract-testing.md` — foundational contract testing patterns

## Anti-Patterns

### Wrong: Using MCP for runtime test execution

```text
# ❌ Don't use MCP to run pact tests — use npm scripts and CI pipelines
# MCP is for agent-assisted design, generation, and review
```

### Right: Use MCP for design-time assistance

```text
# ✅ Use MCP during planning and review:
# - Fetch provider states to inform test design
# - Map the pacticipant network for risk scoring
# - Check can-i-deploy and the matrix during CI pipeline design and failure diagnosis
```

### Wrong: Letting an agent write to the broker

```text
# ❌ Agent calls contract-testing_publish_consumer_contracts or contract-testing_record_deployment
#    from a workstation. The broker now holds a version no pipeline built, and can-i-deploy answers for it.
# ✅ Publishing and deployment records come from CI, with the commit SHA and branch of the build.
```

_Source: SmartBear MCP documentation, PactFlow developer docs, and the tool list of `@smartbear/mcp` 0.44.0 read over MCP `tools/list`._
