---
title: 'tea-test-review CLI'
description: 'Headless CI runner for the bmad-testarch-test-review skill: flags, exit codes, JSON verdict schema, and security model'
---

# tea-test-review CLI

`tea-test-review` is a headless runner for the [Test Review](/docs/how-to/workflows/run-test-review.md) workflow (`bmad-testarch-test-review`). It scopes the review to a pull request's changed test files, drives the skill non-interactively, parses the resulting `test-review.md` against a strict schema, and emits a JSON verdict with a CI-friendly exit code.

The skill is the source of truth for all review logic (checklist, scoring, report template). The CLI only resolves the skill, scopes the review, runs the agent, parses the report. How it's built: [Test Review CLI Architecture](/docs/explanation/test-review-cli-architecture.md).

## Prerequisites

- Node.js 20+, with the `tea-test-review` bin (`npm install --global bmad-method-test-architecture-enterprise`, or via `npx`).
- The `bmad-testarch-test-review` skill present in the workspace **when the CLI runs**. The reviewed repo doesn't need to commit BMAD files or install the TEA module; CI can fetch the skill as a build step (see the [example workflow](#example-workflow)). Two ways to supply it:
  - **Discovered in the project**: probed at `_bmad/tea/workflows/testarch/bmad-testarch-test-review`, `.claude/skills/bmad-testarch-test-review`, `.agents/skills/bmad-testarch-test-review`. Local-dev case.
  - **Pinned with `--skill-root <path>`** (recommended for CI): unpack from a pinned npm tarball, point `--skill-root` at it. Reviewer never comes from the PR checkout.
- For `--agent claude` (default): the `claude` CLI on `PATH`, authenticated via subscription/keychain login or `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` in the environment.
- For `--agent codex`: the `codex` CLI on `PATH`, authenticated via `codex login` (stored under `$HOME`) or `OPENAI_API_KEY` in the environment.

## Flags

| Flag                                                   | Default                        | Purpose                                                                                                                           |
| ------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `--base <ref>`                                         | `origin/main`                  | Git base ref to diff changed files.                                                                                               |
| `--files <list>`                                       | -                              | Explicit review set (repeatable, comma-separated); skips the git diff and test-file filter.                                       |
| `--scope <scope>`                                      | derived                        | `review_scope` override (`single` \| `directory` \| `suite`); default `single` for one file, else `directory`.                    |
| `--test-dir <dir>`                                     | `tests`                        | `test_dir` hint passed to the skill.                                                                                              |
| `--test-glob <substring-or-regex>`                     | -                              | Extra test-file matcher (substring or `/regex/`, repeatable).                                                                     |
| `--project-root <dir>`                                 | current directory              | Consuming project root.                                                                                                           |
| `--skill-root <path>`                                  | probe the project              | Trusted skill root (must contain `SKILL.md`); skips the install probe. Outside `--project-root`, the control-plane guard is moot. |
| `--output <file>`                                      | `test-review.md`               | Report path the agent writes.                                                                                                     |
| `--json <file>`                                        | -                              | Also write the verdict JSON here.                                                                                                 |
| `--agent <agent>`                                      | `claude`                       | `claude` or `codex` spawn the matching CLI via its adapter (`cli/lib/agent-adapters.js`); `none` prints the prompt only.          |
| `--agent-cmd <path>`                                   | the selected adapter's command | Override the agent executable; the selected `--agent` adapter's argv/env still apply (advanced).                                  |
| `--claude-arg <arg>`                                   | -                              | Extra argument appended to the selected agent's argv (repeatable; name predates multi-vendor support).                            |
| `--env-pass <NAME>`                                    | -                              | Env var allowed through beyond the default set (repeatable).                                                                      |
| `--timeout-ms <n>`                                     | `1800000` (30 min)             | Agent wall-clock timeout (SIGTERM on expiry).                                                                                     |
| `--min-score <n>`                                      | -                              | Fail when the quality score is below `n` (0-100).                                                                                 |
| `--max-critical <n>`                                   | no cap                         | Fail when Critical violations exceed `n`.                                                                                         |
| `--min-files <n>`                                      | `1`                            | Fail when fewer than `n` files are reviewed.                                                                                      |
| `--fail-on <level>`                                    | `request-changes`              | Weakest recommendation that fails CI.                                                                                             |
| `--fail-on-skip`                                       | off                            | Exit 1 instead of 0 on skip (no changed test files).                                                                              |
| `--waive <reason>`                                     | -                              | Waive a fail (exit 0), record the reason; requires `--waive-until`. Exit 2/3 never waivable.                                      |
| `--waive-until <YYYY-MM-DD>`                           | -                              | Waiver expiry; must be a real future calendar date.                                                                               |
| `--isolate` / `--no-isolate`                           | isolated when `CI` is set      | Run the agent under filesystem isolation.                                                                                         |
| `--use-playwright-utils` / `--no-use-playwright-utils` | resolved (below)               | Force `tea_use_playwright_utils`.                                                                                                 |
| `--use-pactjs-utils` / `--no-use-pactjs-utils`         | resolved (below)               | Force `tea_use_pactjs_utils`.                                                                                                     |
| `--pact-mcp <mode>`                                    | resolved (below)               | Force `tea_pact_mcp` (`mcp` \| `none`).                                                                                           |

## TEA config resolution

Four config keys pick which knowledge fragments load: Playwright Utils profile, `pactjs-utils` set, Pact MCP, and browser evidence (`tea_browser_automation`). The CLI states all four in the prompt: an unstated key is a key the agent decides itself, and identical files could then review against different knowledge.

The headless contract fixes browser evidence to `tea_browser_automation=none`, plus a separate execution-mode key to `tea_execution_mode=sequential`. The other three fragment keys resolve by precedence, highest first:

1. Explicit flag (`--use-pactjs-utils`, `--no-use-playwright-utils`, `--pact-mcp mcp`)
2. `<project-root>/_bmad/tea/config.yaml` (written by `npx bmad-method install`)
3. Module default from `src/module.yaml`: `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: false`, `tea_pact_mcp: none`

A missing `config.yaml` is normal: CI installs the skill without running the interactive installer, so no config file is expected. Content that exists but is invalid is an error (exit 2): non-boolean `tea_use_*`, a `tea_pact_mcp` outside the enum, unparseable YAML, or a non-mapping file. Quoted booleans (`'true'`, `'false'`) are coerced.

**In CI, state what you need.** A contract-testing repo gets `tea_use_pactjs_utils: false` by default, loads `contract-testing.md` instead of the `pactjs-utils-*`/`pact-*` fragments, and won't flag a missing determinism gate. Commit `_bmad/tea/config.yaml` or pass `--use-pactjs-utils`.

## Exit codes

| Code | Meaning                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Review passed, was skipped, or a verdict failure was waived.                                                                                                       |
| `1`  | Review verdict fail: failing recommendation, `--min-score`, `--max-critical`, `--min-files`, `--fail-on-skip`, or a deletions-only diff, without an active waiver. |
| `2`  | Environment or config error: skill not found, invalid flags, unsafe paths, git diff failure, or the control-plane guard.                                           |
| `3`  | Agent or parse failure: agent errored, wrote no fresh report, or the report failed strict validation.                                                              |

### Waived semantics

`--waive <reason> --waive-until <YYYY-MM-DD>` turns any exit-1 outcome into exit `0`, adds `waived: true`, `waiveReason`, `waiveUntil` to the verdict, and prints a `WAIVED` banner to stdout. Exit codes 2 and 3 are **never** waivable: a broken gate or an unparseable report is not a verdict.

## JSON verdict schema

A passing review (also written to `--json <file>` when given):

```json
{
  "report": "test-review.md",
  "files": ["tests/checkout.spec.ts"],
  "recommendation": "Approve",
  "qualityScore": 92,
  "violations": { "critical": 0, "high": 1, "medium": 2, "low": 3 },
  "reviewedFiles": ["tests/checkout.spec.ts"],
  "keyStrengths": ["Fully deterministic, no conditional branching or timing dependencies"],
  "keyWeaknesses": ["Missing explicit test IDs on two test cases"]
}
```

`keyStrengths` and `keyWeaknesses` are best-effort, pulled from the report's Executive Summary bullet lists for PR-comment display; they're not part of the gating contract, a report that omits them still passes or fails on its own merits and the fields just come back as `[]`.

A failing verdict adds `gateFailures` (machine-readable reasons, e.g. `"insufficient evidence: 1 files reviewed (3 required)"`); a waived failure adds `waived`, `waiveReason`, `waiveUntil`.

A skipped review (no changed test files):

```json
{
  "skipped": true,
  "reason": "no changed test files in diff",
  "recommendation": null,
  "qualityScore": null,
  "files": []
}
```

A deletions-only diff uses `reason: "only test deletions in diff; nothing to review"` and adds `deletedFiles`. A waived skip gains the waiver fields. With `--agent none` the payload is `{ "promptOnly": true, "files": [...] }`.

## Reviewed-files manifest contract

The verdict's `files` manifest comes from the report's own `## Reviewed Files` section: what the agent actually reviewed. `--min-files` evaluates this manifest.

The report itself is strictly validated:

- YAML frontmatter: `workflowType: testarch-test-review`, non-empty `stepsCompleted`
- Matching `**Recommendation**` lines in both the Executive Summary and Decision sections (one of `Approve` / `Approve with Comments` / `Request Changes` / `Block`)
- A bounded `**Quality Score**: N/100`
- A `**Total Violations**` line with all four severity counts
- A `## Quality Score Breakdown` ledger
- The Reviewed Files manifest

Fenced code blocks are stripped first, so a quoted example can't spoof a verdict.

The score is recomputed rather than trusted: the CLI evaluates `100 - (Critical × 10 + High × 5 + Medium × 2 + Low × 1) + Total Bonus` against the report's own violation counts, and rejects a score that contradicts its breakdown, a bonus total outside the legal multiples of 5 from 0 to 30, or a missing breakdown section. The prompt states this same arithmetic.

A report declaring Critical violations alongside an approve-type recommendation is rejected as an inconsistent verdict (exit 3): Critical means Must Fix. Stale artifacts are never parsed, output files are deleted before the run and must be freshly written by it.

## Example workflow

[Example CI workflow](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/pr-test-review.yml) is a copy-paste starting template: two jobs (review + PR comment), full-history checkout, skill and CLI installed from an exactly-pinned npm version, `--skill-root "$GITHUB_WORKSPACE/_bmad/tea/workflows/testarch/bmad-testarch-test-review"`, artifacts uploaded for both report and verdict JSON, and a find-and-update PR comment that distinguishes pass, fail, skip, and infrastructure failure. Make the `review` job a required status check to gate merges.

The comment carries the score/recommendation/violations digest plus up to three `keyWeaknesses` bullets, and inlines the full report in a collapsed `<details>` block (falling back to an artifact link alone above ~40,000 characters, GitHub's comment body cap is 65,536) so a reviewer can paste it straight into an AI coding agent to apply the fixes.

[Adapting it](https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise/blob/main/cli/examples/README.md) covers two common real-world shapes: a central reusable-workflows repo, and a repo already using a third-party review bot like CodeRabbit.

## Security model

- **Stdin prompt delivery**: the prompt travels to the agent on stdin, never argv, so it can't leak through process lists.
- **Safe-mode agent execution**: `--safe-mode` (repo customizations stripped), a restricted tool set (`Read,Write,Edit,Glob,Grep`), a minimal child environment; only `--env-pass` variables are added.
- **Filesystem isolation**: with `--isolate` (default on in CI) the agent may read the project but can't modify the tree under review; it writes only the report, verdict, and the temp files the workflow's own subagent steps declare (sandbox-exec on macOS, bwrap on Linux, chmod fallback).
- **Control-plane guard**: a PR diff that modifies the vendored skill fails the run closed (exit 2) unless `--files` was explicit. An explicit `--skill-root` outside the checkout is untouchable by the diff.
- **Untrusted-content contract**: reviewed-file content is data: instructions inside reviewed files are defects to report, never commands. Hostile paths (newlines, NUL bytes, delimiter literals) are rejected before they reach the prompt; the review set is carried as a JSON array.
- **Fail-closed parsing**: the strict report schema above; a parse failure is never a silent pass, and inconsistent verdicts (Critical violations with an approve recommendation) are rejected.
