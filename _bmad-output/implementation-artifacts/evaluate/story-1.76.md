---
title: 'Require an explicit custom-agent version response'
type: 'feature'
created: '2026-10-03'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '32e16176783215c5719f819d5b116a6f7eadbb39'
context:
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/test-design-epic-1.md'
  - '{project-root}/_bmad-output/planning-artifacts/evaluate/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/evaluate/story-1.72.md'
---

<frozen-after-approval reason="owner delegated Story 1.76 build and merge through the Evaluate relay">

## Intent

**Problem:** Story 1.72 accepts one semantic-version token anywhere in a custom sealed-brief agent command's `--version` output, so a command that prints an incidental dependency version can bind that version as `tea.evaluatorAgentVersion` and `run.json.evaluator.version`.

**Approach:** The `custom` adapter in `cli/lib/agent-adapters.js` reads a keyed response: stdout is one line of JSON whose `agentVersion` is a semantic-version string. The built-in `claude` adapter keeps its own free-text parser. Docs and the evaluator guide state the shape, show an example and tell existing custom commands what to change.

## Boundaries & Constraints

**Always:** Keep version knowledge in `agent-adapters.js` (`run.js`, `evaluators.js` and `sealed-brief-agent.js` hold no `--version` or parser). A refused response exits 12 before calibration, qualification or any trial record. `score` and accepted-baseline replay read the recorded configuration and start no version probe. Only stdout is parsed for `custom`; stderr is free for the command's own logging.

**Never:** Route `claude` through the JSON parser. Add a fallback to the free-text parser. Change the probe's timeout, environment or `--` refusal. Touch `package.json` or `package-lock.json`.

## I/O & Edge-Case Matrix

| Scenario         | Input / State (custom `--version` stdout) | Expected Output / Behavior                                                                              | Error Handling                       |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Keyed response   | `{"agentVersion":"1.0.0"}` plus newline   | Both recorded fields hold `1.0.0`; a changed value changes the configuration digest and scoring version | None                                 |
| Plain dependency | `stub-evaluator-agent 1.0.1`              | Exit 12, no `trial-sets.json`, no agent launch                                                          | Probe error names the expected shape |
| Wrong key        | `{"dependencyVersion":"2.3.4"}`           | Exit 12 as above                                                                                        | Same                                 |
| Malformed JSON   | `{"agentVersion":`                        | Exit 12 as above                                                                                        | Same                                 |
| Multiple lines   | Two JSON lines                            | Exit 12 as above                                                                                        | Same                                 |
| Invalid value    | `{"agentVersion":"latest"}`               | Exit 12 as above                                                                                        | Same                                 |
| Built-in adapter | `claude` output `2.1.282 (Claude Code)`   | Parses to `2.1.282`                                                                                     | None                                 |

</frozen-after-approval>

## Code Map

- `cli/lib/agent-adapters.js` -- `custom` entry (~392) and `claude` entry (~231) both use `parseInstalledVersion` (~471); `observeAgentVersion` (~439) joins stdout and stderr before parsing. Add a keyed `parseCustomAgentVersion`; give `custom` a stdout-only version stream.
- `test/fixtures/evaluate/evaluators/stub-evaluator-agent.js` -- `--version` branch (~80-100) prints `stub-evaluator-agent <v>`; `stub-mcp-agent.js` (~41) and `stub-api-agent.js` (~45) print plain text. All three move to JSON; the evaluator stub gains fault modes selected by the version file.
- `test/test-evaluate-evaluators.js` -- `checkAgentVersionFaults` (~1628) loops fault modes; `checkAgentVersionAdapterBoundary` (~1778) asserts the old parser at :1791-1792; `checkAgentVersionUpgrade` (~1551) already proves digest, scoring version and score/baseline replay without the command.
- `docs/reference/tea-evaluate-cli.md` (~968) and `src/workflows/testarch/bmad-testarch-evaluate/references/evaluator.md` `### Installed agent adapter version` (~39) -- the contract text; `test/test-evaluate-guidance.js` (~2195) holds the guide's markers.
- `CHANGELOG.md` line for Story 1.72 mentions this follow-up; `sprint-status.yaml` row `1-76-...`.

## Tasks & Acceptance

**Execution:**

- [x] `cli/lib/agent-adapters.js` -- keyed parser for `custom`, stdout-only; clearer probe error -- closes the incidental-version path
- [x] Three stub agent fixtures -- answer `--version` with the JSON shape; evaluator stub gains `plain-dependency`, `dependency-only`, `bad-json`, `multi-line`, `invalid-version` modes -- fixtures match the contract
- [x] `test/test-evaluate-evaluators.js` -- refusal modes in `checkAgentVersionFaults`; parser asserts in the adapter-boundary case (keyed, wrong key, claude independent); keep the upgrade and replay case
- [x] `docs/reference/tea-evaluate-cli.md`, `evaluator.md`, `test-evaluate-guidance.js` (and the CLI reference's contract test) -- shape, valid example, update note for existing commands; markers that fail when either example is removed
- [x] `CHANGELOG.md`, sprint row `review`, this record -- behavior, revert observations, gates

**Acceptance Criteria:**

- Given a keyed response, when `tea-evaluate run` prepares the evaluator, then both fields hold it and a change moves the digest and scoring version; the free-text parser fails the keyed contract assertion.
- Given any refused response, when the run starts, then exit 12 precedes calibration, qualification and trial sealing; dropping the key requirement lets the plain case through.
- Given `claude`, when its output is parsed, then the free-text parser answers; routing it through the JSON parser fails.
- Given a scored run whose command was removed, when `score` and baseline replay run, then bytes match and no version read happens.
- Given the reference and the guide, when read, then each shows the shape, an example and the update for existing commands.

## Implementation Notes

- `agent-adapters.js` gains `parseCustomAgentVersion`: stdout minus one trailing line break must be a single line of JSON object whose `agentVersion` is a semantic version (`major.minor.patch` with optional prerelease and build parts), else `null`. The `custom` entry sets `versionStreams: 'stdout'` and a `versionExpectation` string, and `observeAgentVersion` reads stdout alone for it and appends the expectation to the refusal. `claude` keeps `parseInstalledVersion` over stdout and stderr. No fallback to the free-text parser exists, and the probe's timeout, environment and `--` refusal are untouched.
- The evaluator stub answers `--version` as `{"agentVersion":"<file value>"}` and, from the version file, as `plain-dependency`, `dependency-only`, `bad-json`, `multi-line`, `invalid-version` or `stderr-only`. Every read also logs a dependency version on stderr, so each run proves stderr never binds. The MCP and API stubs print the JSON line.
- `checkAgentVersionFaults` loops the new modes (exit 12, no `trial-sets.json`, no launch, refusal names the shape); `checkAgentVersionAdapterBoundary` asserts keyed accept and refuse cases, and that `claude` still parses `2.1.282 (Claude Code)` and rejects the JSON shape. The upgrade case still proves digest, scoring version, and `score` and accepted-baseline replay without the command and without a launch.
- The CLI reference, the evaluator guide and `test-evaluate-guidance.js` (which now also reads the CLI reference) carry the shape, the example and the update note.
- Isolated reverts, each failing: custom routed to the free-text parser (adapter assertions and the after-trial version read cases fail); `claude` routed through the JSON parser (adapter-boundary assertion fails); a free-text fallback after the keyed parser (`plain-dependency` seals a trial set and launches an attempt).

## Spec Change Log

## Review Triage Log

Round 1 (blind, edge case, verification gap; three Opus reviewers):

- No length bound on `agentVersion` (edge 1): **medium**, patch. A 30 MiB value reached the configuration, the digest and `run.json`. Both parsers now refuse a version over 256 characters.
- Regex accepts non-SemVer values such as `01.02.03` and `1.2.3-..` (edge 2, blind 1): **low**, patch. The custom parser uses the SemVer 2.0.0 grammar; `claude` keeps its free-text shape.
- Duplicate `agentVersion` keys bind the last silently (blind 2): **low**, patch. A line that repeats the key, escaped spellings included, is refused.
- The Story 1.72 changelog line promised a follow-up contract (blind 3): **low**, patch. It now points at the keyed response.
- The static guard scanned for two needles only (blind 4): **low**, patch. It scans for all four version identifiers in `run.js`, `evaluators.js` and `sealed-brief-agent.js`, and a tree walk over `cli/` holds the probe and the adapter parsers to `agent-adapters.js` and `run.js`.
- A best-effort version read in `score` would pass (verification 1): **medium**, patch. The removed command is now a tripwire that records any invocation; score and the copied-baseline replay assert it was never touched.
- Baseline replay is simulated with `score`, not `tea-evaluate ci` (verification 2): **medium**, partly patched. The `ci` replay for a sealed-brief run needs a CI fixture the suite does not have; `ci.js` already imports `run.js`, which holds the probe, so the tree walk does not guard that path. Today the replay calls `score` only (`ci.js` replay path), and the gap stays open until a sealed-brief `ci` fixture exists. Recorded as accepted.
- Refused shapes ran without calibration configured (verification 3): **low**, patch. They run with `rubric: true`.
- CLI reference markers read the whole file (verification 4): **low**, patch. They read `### The evaluation layer`.

## Verification

**Commands:**

- `npm run test:evaluate-evaluators`, `npm run test:evaluate-guidance`, `npm run test:evaluate-arms` -- expected: pass
- `npm run docs:validate-links`, `npm run docs:build`, `npm run lint`, `npm run lint:md`, `npm run format:check` -- expected: pass
- `node --input-type=module -e "const m = await import('eval-quality'); if (typeof m.evaluateTarget !== 'function') process.exit(1)"` -- expected: exit 0
