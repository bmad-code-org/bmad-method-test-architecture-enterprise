# Codex AUTOMATE generation evaluation

These captures execute the current merged Automate skill through Codex with pinned model `gpt-5.6-sol` and Codex CLI `0.162.0`.
`test/eval-automate.js` remains the deterministic evaluator of hand-authored controls.

| Capture    | Actual in-agent execution                                                            | Independent native execution                                                      | CLI outcome                                                                           |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `before`   | Seven generated API tests; execution blocked by loopback `listen EPERM`              | Seven fixed tests pass; inclusive-minimum mutation produces one assertion failure | Generic skill runner exits 0; workflow reports could not measure                      |
| `after`    | Seven generated API tests pass through the real HTTP service                         | Seven fixed tests pass; mutation produces two assertion failures                  | Preliminary controller exits 1 for the unreachable fixed-discount coverage branch     |
| `red`      | Five disposable acceptance tests fail at their intended missing criteria; zero skips | Native ATDD report retained with unchanged production files                       | Preliminary controller exits 0; permanent scaffolds retain their skips                |
| `final`    | Eight generated API tests pass through the real HTTP service                         | Eight fixed tests pass; mutation produces three assertion failures                | Pre-cold-review controller exits 1 for the unreachable fixed-discount coverage branch |
| `reviewed` | Nine generated API tests pass through the real HTTP service                          | Nine fixed tests pass; mutation produces three assertion failures                 | Request-bound controller exits 1 for the unreachable fixed-discount coverage branch   |

Codex workspace-write sandboxing initially blocked local test services from listening on loopback.
Command execution now passes `sandbox_workspace_write.network_access=true`, while explicit caller arguments retain precedence.
The controller validates native Playwright and ATDD reports, guards input and evidence files against JSON output collisions, and requires explicit checkpoint Resume after interrupted runs.

In the test fixture catalog, `FLAT5` subtracts 5 and requires a cart total of at least 20, making capped fixed discounts unreachable.
Every capture preserves that constraint and leaves production source untouched.
Zero healing rounds were needed in these generated suites.
The separate generation-healing test suite covers automated repairs and preserved product failures.

Workflow artifact paths are shortened for Windows checkouts.
Original project paths remain in manifests, summaries, and archive files.
Provenance records every relocation and hash.

Each phase contains model output, generated files, workflow artifacts, an archive, SHA-256 provenance, and tool events.
`tool-session-index.json` indexes tool call and output lines for each captured session.
It omits session metadata, reasoning, and account identifiers.
`after/scorer-development-attempt` preserves the scorer's initial run.

`final/provenance.json` records the command, CLI source hashes, output, and independent score.
CLI modules remained unchanged throughout the run.

Review identified stale Create artifacts, unverified red infrastructure, JSON hardlink collisions, and unhedged Resume settings.
Regressions cover each case.
The controller binds request identity, checks native assertions, preserves checkpoint state, requires a fresh Validate report, and guards inode aliases.
The `reviewed` capture is a fresh Codex run with these semantics.
All captured sessions used the pinned model `gpt-5.6-sol`.

Replay the retained generation without a model call:

```bash
npm run test:automate-generation-evidence
```

This check verifies capture hashes, preserves red skips, and executes the generated suite against fixed and mutated copies.
Execution uses the supervised process runner on allocated ports.
The scorer records statuses, runner errors, hashes, and assertion failures.
It saves stdout, stderr, and execution records for timeout or signal outcomes.

A later controller revision added test leaf reconciliation, completed-step checks, disabled-healing counter checks, and directory input protection.
Replay applies that parser to the unchanged reviewed manifest and report, and reconciles red ATDD leaf identities.
Provenance hashes confirm the model output remains unmodified.

To inspect or execute a captured project separately, extract its archive into a new directory and provide its Playwright dependency:

```bash
mkdir /tmp/automate-capture-review
cd /tmp/automate-capture-review
tar -xzf /path/to/test/results/automate-codex-2026-10-09/reviewed/project.tar.gz
npm install --ignore-scripts
npm test
```

These captures cover one baseline run, three voucher generation runs, and one locker acceptance run.
