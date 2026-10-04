# Epic 2 Proof: TeA runs its `pr` tier (Story 2.5, AD-11, AD-15)

Recorded 2026-10-04 on branch `feat/evaluate-2.5`, off `main` at `6b6abf49`.
Engine: eval-quality 7.1.0, the release `package.json`'s `latest` devDependency resolves.
TeA 1.27.2.

## Result

Every evaluation TeA keeps is a script of the `npm test` chain, `test:evaluate-pr-<key>`, which runs `node test/test-evaluate-pr-tier.js <key>`: `tea-evaluate ci --tier pr` over the committed folder, with no secret and no model call.
The `chain` matrix of `.github/workflows/quality.yaml` runs each one, and `npm run test:ci-coverage` (126 chained steps) and `npm run test:shards` pass.

| Script                         | Evaluation (Story)                       | Exit | `pr` checks that ran                                                         | `ci --tier pr` time |
| ------------------------------ | ---------------------------------------- | ---- | ---------------------------------------------------------------------------- | ------------------- |
| `test:evaluate-pr-mcp`         | grader tool server (1.10)                | 0    | check, compile, seal, oracle-agreement, replay                               | 1.3 s               |
| `test:evaluate-pr-api`         | grader HTTP service (1.11)               | 0    | check, compile, seal, api-conformance, oracle-agreement, replay              | 2.8 s               |
| `test:evaluate-pr-suite`       | `bmad-testarch-evaluate` (1.16)          | 0    | check, compile, seal                                                         | 0.6 s               |
| `test:evaluate-pr-workflow`    | records workflow (1.18)                  | 0    | check, compile, seal, oracle-agreement, replay                               | 1.3 s               |
| `test:evaluate-pr-tool-use`    | calling-agent tool use (1.19)            | 0    | check, compile, seal, oracle-agreement, replay                               | 1.4 s               |
| `test:evaluate-pr-promptfoo`   | promptfoo summary (1.20)                 | 0    | check, compile, seal, oracle-agreement, replay                               | 1.3 s               |
| `test:evaluate-pr-ai-feature`  | AI-feature authoring suite (1.24)        | 0    | check, compile, seal, api-conformance, gameability, oracle-agreement, replay | 4.7 s               |
| `test:evaluate-pr-test-review` | test-review authoring suite (1.24)       | 0    | check, compile, seal, gameability, oracle-agreement, replay                  | 3.6 s               |
| `test:evaluate-pr-gap-loop`    | gap-loop `after` evaluation (1.25)       | 0    | check, compile, seal, gameability, oracle-agreement, replay                  | 3.4 s               |
| `test:evaluate-pr-learn`       | learned framework, pantry summary (1.26) | 0    | check, compile, seal, oracle-agreement, replay                               | 1.8 s               |

The two CI repositories of Story 2.4 (`tagged-release`, `nightly-deploy`) already run the `pr`, `merge` and `release` tiers of their plans in `test:evaluate-ci-repositories`, and `nightly-deploy` adds `scheduled`.

### Measured `pr` tier duration (test-design-epic-2 performance row)

The ten `ci --tier pr` invocations take 22.2 s serially on the recording machine (Apple silicon, local disk); the slowest, `ai-feature`, takes 4.7 s, and each chained script (`npm run`, with Node start and the driver's own checks) adds under a second.
The weights in `tools/test-shard-weights.json` are the same scripts measured under `NODE_V8_COVERAGE`: 0.9 to 5.5 s each, 28.1 s together.
The tier needs no secret, no model call and no target launch, so its time is the replay's `preflight` and `score` over committed bytes.

## Baselines

Each baseline came through `compare --accept` from a clean run of both partitions in a disposable copy with a unique directory name under the session scratch directory (a git repository holding one commit, the packages `eval-quality` and the TeA package linked above it), so every `run.json` records `dirty: false`, `workspace.kind: copy` and `completed: true`.
The MCP and API baselines are the ones Story 1.104 re-recorded on 7.1.0; the other seven are new.
`run.json` records the copy's `/private/tmp` root and its `/private/var/folders` workspaces, and each `scores/<invocation>/` call record carries the copy's `/private/tmp` argv and the eval-quality CLI path of the recording checkout under `/Users/`.

| Evaluation  | Accepted run                   | Score invocation               | Probes | Contract verdict            |
| ----------- | ------------------------------ | ------------------------------ | ------ | --------------------------- |
| mcp         | `20261004T124642952Z-9a9c88f5` | `20261004T124645495Z-a4eddad9` | 2      | CONCERNS (4 coverage rules) |
| api         | `20261004T124711002Z-f2997476` | `20261004T124715430Z-9131950a` | 2      | CONCERNS (5 coverage rules) |
| workflow    | `20261004T191316166Z-bc619555` | `20261004T191320390Z-3da3cda9` | 2      | CONCERNS (6 coverage rules) |
| tool-use    | `20261004T191335891Z-0ce3e7fd` | `20261004T191343779Z-a84c452d` | 2      | CONCERNS (4 coverage rules) |
| promptfoo   | `20261004T191353878Z-cbee24f1` | `20261004T191406606Z-a7a40fad` | 2      | CONCERNS (4 coverage rules) |
| ai-feature  | `20261004T191446599Z-3e9d14bf` | `20261004T191642924Z-d9a16f31` | 15     | PASS                        |
| test-review | `20261004T191657799Z-2abe4791` | `20261004T191803168Z-89b098e2` | 17     | PASS                        |
| gap-loop    | `20261004T192119203Z-1fa663d9` | `20261004T192224143Z-77271974` | 16     | PASS                        |
| learn       | `20261004T191416879Z-8cc331b3` | `20261004T191429352Z-98099778` | 6      | PASS                        |

The five two-probe protocol fixtures (a clean control and one seeded defect each) record CONCERNS; `ci` reports it as a warning and exits 0, as AD-10 gives it.
The four suites authored through Evaluate score PASS.

### Replay digests

The replay re-runs eval-quality's `preflight` over the baseline's contract, probes and observations and `score` over its records, then compares the produced files with the baseline's byte for byte.
The produced and baseline digests of the verdict and the strength aggregate for each evaluation, equal in every row:

| Evaluation  | `preflight-verdict.json`                                                  | `strength-aggregate.json`                                                 |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| mcp         | `sha256:5276d2247079eda69490b2d259cb93866a810f30299d2be3ec2a57c74481b15b` | `sha256:d86eed4497c8b5af85e87b430ac16dd72001dad77398731b48d2e5cb259136ca` |
| api         | `sha256:fda9ee7512195ae1c61e46403fd2b3a1abe57c4ff4bae3e13af04294b707f743` | `sha256:fdc106963384e83b49cac4f11046fd3a0f7e7df1bdde6adf857903ec004d96f8` |
| workflow    | `sha256:f7db600be7353ebd20683ac0edf4f1f8c22e3b3e886c2c3a256d9110255c45b6` | `sha256:81d4cb97dc59957b79b68855355cb2001fac39d09dfa24087d32afc2eea8f0e9` |
| tool-use    | `sha256:5920deb4fa4b259978e147cc6d1391262d68b18d2782f365e8ab850679d1daf0` | `sha256:c22fb4313872567a181a85652f0ccc25965b5f3f75194bef32a47a90c8d2c369` |
| promptfoo   | `sha256:93fad916e18129174da39fa519c2e086208afb635049f347a136720cf3211ca5` | `sha256:6b00ebb045dac3ff531b1d256ec3f51f17fc96ae49c17785bd41c1741e66214a` |
| ai-feature  | `sha256:b11fd6cca7d4ded69028879d9c2f618851b1b4bec1730eb053fed9342beabd2d` | `sha256:4fc3279bcd4ca631fad91f718e2abae1f0bf6e86cabd6f19fe71a3f4db819e07` |
| test-review | `sha256:203d20eac3cc9e355baad73899f72fcb4f90e8acc725d743e31b61f2e38e376d` | `sha256:83007b82b3abdf0bd3f907606f3d7a6fdd58d4ff446448cd4f5a097ee9772859` |
| gap-loop    | `sha256:3a286900b5250b44d9f2b93afd93e073975adc48617fd75b27edbb33df5bf9ed` | `sha256:f013bc14c9d957608c23a5efdbb8e94af39bcb3405fc1b78953633a513cffd36` |
| learn       | `sha256:12e1fa8ad6686a2117b015bb2149bd27a6ba789b87c82db9f28ff7265c1d6f32` | `sha256:144cbae24f44c2772800567452101964b91c08280409d71bd09ef1aa36e33b59` |

The gameability arm ran for `ai-feature` (P-009, P-015), `test-review` (P-009, P-015, P-017) and `gap-loop` (P-009, P-017), each through `score` over the baseline's records with no target launch.
`oracle-agreement` read `0 oracle outcome(s) that disagree or cannot be evaluated` in every evaluation.

## The Evaluate-authored suite

`test/evaluations/bmad-testarch-evaluate/` has a committed plan, `ci/evaluation-ci-plan.json`, with its three non-replay `pr` checks.
`check`, `compile` and `seal` exit 0 through `test:evaluate-pr-suite`, and each invocation leaves `runs/<invocationId>/` with the compiled `eval-contract.json` and the `sealed-evaluator-brief.json`.

Its replay is pending Story H.1.
The suite has no accepted baseline: Story H.1 replaces the dirty proof run with a clean one on the merged tree, accepts it with `compare --accept`, and adds the `replay`, `oracle-agreement` and `gameability` checks to the plan, which `test-evaluate-pr-tier.js` then holds (a `baseline/` beside a three-check plan fails `folderProblems`).
The evidence that run replaces is cited from `epic-1-proof.md`:

- The dirty proof run (Story 1.16, section "Commands and exit codes"): development run `20260928T165418209Z-f89a3a6b` and held-out run `20260928T172058296Z-10c3eca0`, both `dirty: true`, with the independent re-score table's evidence artifacts for P-001, P-004, P-002 and P-003 (`sha256:8df27be8…`, `sha256:2ccb0f66…`, `sha256:271f4e0b…`, `sha256:fa8d5d41…`).
- The verdicts: clean controls `passed-clean-control` in 5 of 5 trials, both seeded probes `caught` in 5 of 5 trials, and the contract verdict recorded as found (section "Result"); the Story 1.46 after state (section "Before and after") closes the four coverage rules.
- The rollback proof: both mutations restored to the pre-mutation digest `sha256:16c4fd7b…bcf93` with the baseline re-passing on the first attempt (section "Rollback evidence").

## Evidence retention and the gates

The `chain` job uploads `runs/` of every evaluation as `evaluate-runs-<shard>` with `if: always()`.
`test:evaluate-ci`'s case "the pr tier of TeA itself" parses `quality.yaml` and fails when the step, its `always()`, its shard-qualified name, its `if-no-files-found: ignore` or any one of the ten paths is missing.
It also holds `supply-chain` to `test:lockfile-age`, `test:lockfile-age-cache`, `test:licences` and `test:supply-chain`, `layering-boundary-lineage` to `test:direction`, `test:boundary`, `test:lineage`, `test:guard-publish` and `test:layering-boundary-lineage`, and keeps the doc gates `test:doc-invocations`, `test:doc-counts` and `test:doc-claims` in the `npm test` chain: the eight `eval-quality-gates` stay where they were.

## A defect `ci` found

`ci --tier pr` over the gap-loop `after` evaluation exited 11 before Story 2.5: `oracle-agreement` reported 15 outcomes that disagree on P-010, P-012 and P-013, the three held-out probes whose mutations (M-005, M-007, M-008) violate the oracles of behaviors the probe's defects did not declare.
Story 1.98 repaired the same three probes in the Story 1.24 test-review evaluation.
The `after` evaluation now carries those probes byte for byte, its `replay/` was recorded again from separate development and held-out runs, and `before` keeps the probes the blind session started from.
`test:evaluate-gap-loop` requires the repaired probes to equal the test-review ones and `before`'s to differ.
