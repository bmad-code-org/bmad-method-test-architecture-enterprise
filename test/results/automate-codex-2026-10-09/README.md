# Codex AUTOMATE generation evaluation

These captures execute the current merged Automate skill through Codex with the adapter's pinned `gpt-5.6-sol` model and Codex CLI `0.162.0`. The existing `test/eval-automate.js` remains the deterministic evaluator of hand-authored controls.

| Capture    | Actual in-agent execution                                                            | Independent native execution                                                      | CLI outcome                                                                           |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `before`   | Seven generated API tests; execution blocked by loopback `listen EPERM`              | Seven fixed tests pass; inclusive-minimum mutation produces one assertion failure | Generic skill runner exits 0; workflow reports could not measure                      |
| `after`    | Seven generated API tests pass through the real HTTP service                         | Seven fixed tests pass; mutation produces two assertion failures                  | Preliminary controller exits 1 for the unreachable fixed-discount coverage branch     |
| `red`      | Five disposable acceptance tests fail at their intended missing criteria; zero skips | Native ATDD report retained with unchanged production files                       | Preliminary controller exits 0; permanent scaffolds retain their skips                |
| `final`    | Eight generated API tests pass through the real HTTP service                         | Eight fixed tests pass; mutation produces three assertion failures                | Pre-cold-review controller exits 1 for the unreachable fixed-discount coverage branch |
| `reviewed` | Nine generated API tests pass through the real HTTP service                          | Nine fixed tests pass; mutation produces three assertion failures                 | Request-bound controller exits 1 for the unreachable fixed-discount coverage branch   |

The baseline established that the skill could generate useful boundary coverage. Codex workspace-write sandboxing prevented its configured local service from listening. Command-execution capability now supplies `sandbox_workspace_write.network_access=true`; explicit caller configuration retains precedence. The repaired controller validates actual Playwright/ATDD reports, protects inputs and evidence from JSON output collisions, and requires explicit checkpoint Resume after interrupted generation.

The remaining coverage limitation is observable in the fixture's public catalog. `FLAT5` subtracts 5 and requires a cart total of at least 20, so an accepted fixed redemption cannot exercise capping a discount at the cart total. Every capture preserves that limitation and production source. Zero healing rounds were needed in these generated suites. The repository's separate generation-healing replay exercises test repairs and preserved product failures.

Copied workflow artifacts use compact filenames for Windows checkout. Their original project paths remain in manifests, summaries and the unchanged archives; provenance records every relocation and its preserved hash.

Each phase contains untouched model output, generated files, workflow artifacts, a portable project archive, SHA-256 provenance, and selected raw tool events. `tool-session-index.json` identifies exact tool call/output lines from every captured Codex session at that consuming-project path. It excludes session metadata, reasoning and account identifiers. Earlier `tool-events.jsonl` selected only function tool events; the supplemental indexes include custom tool events as well. Preliminary `after` and `red` captures identify their controller state explicitly. `after/scorer-development-attempt` retains the scorer's first interrupted interpretation of an expected nonzero mutant result.

`final/provenance.json` records the exact command, CLI source hashes, final output and independent score. Canonical worker-step formatting was normalized during that live run without changing its instructions. The CLI modules remained stable throughout the run.

Cold review exposed opaque-success evidence, infrastructure counted as red, stale Create artifacts, unrelated Edit/Validate summaries, JSON hardlink collisions, and an untested saved-settings Resume branch. Public CLI reproductions and regressions cover every correction. The controller now binds request identity and scope, checks actual native assertions, preserves selected checkpoint identity and progress, requires a fresh Validate report, and guards inode aliases. Its request protocol changed, so `reviewed` is a fresh live Codex generation through those corrected semantics. Its CLI source hashes remained unchanged throughout generation. All three captured sessions used the same pinned model, and all fixture source and configuration hashes remain equal.

Replay the retained generation without a model call:

```bash
npm run test:automate-generation-evidence
```

This CI check verifies immutable capture hashes, preserves the delivered red skips, and executes the reviewed generated API suite against fresh fixed and mutated service copies. Native execution uses the existing supervised process tree runner and the original project test configuration. Ports are chosen per run. The scorer records actual attempt statuses, runner errors, source hashes and the assertion failures that detect the inclusive boundary regression. It saves raw streams and an execution record for timeout/signal outcomes before reporting the blocker, and refuses to overwrite an existing measurement.

To inspect or execute a captured project separately, extract its archive into a new directory and provide its Playwright dependency:

```bash
mkdir /tmp/automate-capture-review
cd /tmp/automate-capture-review
tar -xzf /path/to/test/results/automate-codex-2026-10-09/reviewed/project.tar.gz
npm install --ignore-scripts
npm test
```

These results cover one live voucher baseline, three live voucher generations and one live locker acceptance generation. They provide direct evidence for these fixture scopes and the controller contracts.
