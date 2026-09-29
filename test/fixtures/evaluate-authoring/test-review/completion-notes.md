# Authored evaluation handoff

## Artifacts

`evaluation/` contains the confirmed requirements bytes, a schema-version-5 Behavioral Evaluation Contract, CLI registry, 16 physical stdin request cases, 17 section-tagged probes, 8 single-replacement adopter-owned mutations, 2 whole-plan gameability responses, scoring policy, deterministic evaluator selection, and a runs ignore rule. `inspection-record.md` and `requirements-statement.md` sit beside it. `author-suite.mjs` generates the authored suite; `verify-local.mjs` checks local observations without changing `target/`.

The contract covers B-001 missing assertions, B-002 disabled tests, B-003 valid assertion false positives, and B-004 malformed requests. Every behavior has one exact oracle. The request shape is a string `stdin.prompt` whose bytes contain the JSON command request. Empty bytes and `{` reach the target parser as physical malformed inputs. The reviewed file path and both `status` and `findings` are checked together. Three trials are declared per probe.

Development probes P-005 through P-008 use M-001 through M-004. Held-out probes P-010 through P-013 use M-005 through M-008 against the same test files and malformed request as the matching development probes. The held-out mutation patterns differ. Keep P-010 through P-013 and their records out of development gap inspection; use only the engine's held-out gap view after scoring. No held-out run records were authored.

## Evaluator and policy decision

The deterministic evaluator is selected because every admitted observation is an exact JSON field or exit code. No rubric, judge, model snapshot, or evaluator conditions file is needed. The authored policy proposes `severityFloor: low`, `catchThreshold: 0.9`, and `minimumTrialCount: 3`. Three catches out of three exceed the strict threshold. The intake confirms the trial count; it does not explicitly approve the policy ID or thresholds. The maintainer should obtain that policy confirmation before accepting a scored result.

## Checks completed here

- Parsed all 30 authored JSON files.
- Ran all 16 raw stdin request cases against the unmodified target. Each returned the expected review status or a structured error with exit 0.
- Confirmed each of eight mutation search strings occurs exactly once in its adopter-owned target file.
- Applied each development mutation to a separate disposable copy under ignored `evaluation/runs/`; each produced its expected stdout defect signature.
- Left `target/`, `target/intake-answers.md`, and `authoring-inputs.sha256` unchanged.

These checks are authoring smoke observations. They are not eval-quality verdicts or sealed scores.

## Required live gates after import

The isolated folder has no TEA or eval-quality runtime. The maintainer must run `tea-evaluate digest` to create its tool-owned `corpus-index.json`, then `check`, `eval-quality compile`, `eval-quality seal`, `tea-evaluate preflight`, development runs and score, mutation rollback checks, gap repair, and held-out runs and score. Stop on any nonzero exit and revise the authored artifacts at the reported diagnostic. Record installed engine versions, invocation IDs, actual baseline, isolation manifests, and final live evidence. The ignored local smoke directories under `evaluation/runs/` are disposable authoring checks and should be omitted from the import.
