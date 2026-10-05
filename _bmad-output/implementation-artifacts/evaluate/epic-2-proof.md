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
Story 1.91 accepted all nine again from fresh runs on 7.1.0 (the runs and invocations below are the new ones), together with the other three committed baselines (the CI repositories and the `verdict-ci` fixture), so that no baseline names the recording machine.
`run.json` records `<workspace>` and `<repository>` for the copy's workspaces and repository, each observation records `<workspace>` as its `cwd`, and each `scores/<invocation>/` call record carries the argv below the evaluation folder (`runs/<run>/...`), `<staging>/<file name>` for its `--out` and `eval-quality/dist/cli/main.js` for the executable.
The contract verdicts and coverage-rule counts are the ones the earlier baselines recorded.

| Evaluation  | Accepted run                   | Score invocation               | Probes | Contract verdict            |
| ----------- | ------------------------------ | ------------------------------ | ------ | --------------------------- |
| mcp         | `20261005T002637506Z-c07ad017` | `20261005T002640548Z-f865198c` | 2      | CONCERNS (4 coverage rules) |
| api         | `20261005T002653577Z-ef22f04c` | `20261005T002658491Z-0e79935d` | 2      | CONCERNS (5 coverage rules) |
| workflow    | `20261005T002700231Z-2a847f02` | `20261005T002704270Z-060cb355` | 2      | CONCERNS (6 coverage rules) |
| tool-use    | `20261005T003519483Z-09aa2413` | `20261005T003526622Z-1bb66c7f` | 2      | CONCERNS (4 coverage rules) |
| promptfoo   | `20261005T003528438Z-a2899e78` | `20261005T003538994Z-bbfda810` | 2      | CONCERNS (4 coverage rules) |
| ai-feature  | `20261005T003059220Z-94afbbcd` | `20261005T003245693Z-b6fda3d0` | 15     | PASS                        |
| test-review | `20261005T003249653Z-94a4d2b7` | `20261005T003354745Z-4c12b1dc` | 17     | PASS                        |
| gap-loop    | `20261005T003359218Z-a24b1481` | `20261005T003504334Z-a4e8f573` | 16     | PASS                        |
| learn       | `20261005T003540834Z-9af645f6` | `20261005T003551497Z-8eae1cbc` | 6      | PASS                        |

The five two-probe protocol fixtures (a clean control and one seeded defect each) record CONCERNS; `ci` reports it as a warning and exits 0, as AD-10 gives it.
The four suites authored through Evaluate score PASS.

### Replay digests

The replay re-runs eval-quality's `preflight` over the baseline's contract, probes and observations and `score` over its records, then compares the produced files with the baseline's byte for byte.
Since Story 1.91 the comparison covers each probe's `score.json` and `aggregate-strength.json`, because the call records hold neutral path forms; only the invocation's own `score.json` summary stays out.
The produced and baseline digests of the verdict and the strength aggregate for each evaluation, equal in every row:

| Evaluation  | `preflight-verdict.json`                                                  | `strength-aggregate.json`                                                 |
| ----------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| mcp         | `sha256:c25e68c6b6d2bd5d549e17ad544bd57ee8b85804cdc560bc404e9c6caed2ea5e` | `sha256:26b476a636af4146d11374ac3c30e00f6fa162dde73ca58cc2ccf94d576fbd2a` |
| api         | `sha256:e752c9cadbcd4433519f9cb25432a6b6675586ee17069979a7c8d784ccb5f12f` | `sha256:dcecb8aaf28acd2ba2e05639667177ae8fab36a282fde91d6f662dddc23b5e00` |
| workflow    | `sha256:d7e793e814134f010d991b6882518d02bbebb2bdd56a3c1bde63061400153446` | `sha256:0d6015661e2f810a4709c5340614f93f8e45f65972727ffb69dcc932cd85de16` |
| tool-use    | `sha256:bb0e4923a802f0faee1ba1e4b99653177dbadbfddcc8f756e4cb90095011da17` | `sha256:b1b29f0b6fd185c5512d67f27551b4fdb761e5c061514e0550bc5b0790c95345` |
| promptfoo   | `sha256:3b2780965324a7f63bcb432103af1a42ab98f5ecc7f65b64346ecac2a91c4f51` | `sha256:4420dd8f86d2e9395a1718b419b4fea1c77a8f978139d83550fddfd8609ebe7f` |
| ai-feature  | `sha256:502f43594ca6f1d33d7a729d28c71cd6aa1350bddae9e6d6e849f1844f2e0165` | `sha256:856850f9edd1be72ca9bcdd371f59f44f5d1cf8c5ade43748500c4c6ccbe4ce3` |
| test-review | `sha256:34c8188dbe81c9177cbeb960e4fada7040cc1bfe9363637f1d305fb892d96caf` | `sha256:ac31ae6c41ff5f9c1de4b1a443cebde35c71d5647d45519bed304c4e897c53ff` |
| gap-loop    | `sha256:7bc4e6fe6794ba68238c35980ec2ca0e633fffd3b656a79a643cf991169c7a1a` | `sha256:4a397cf8bdf25d75efadcc1638918a64e1568e6989180ab89ff64aeaa580f80f` |
| learn       | `sha256:d46affe2db69cc54c8bda4aa28cda19af52130b454ec92e77a5d27dcbecebd4c` | `sha256:51ebb70caf8379550e957a66c6528b87d707be5939c0963bf91b01417e5afa27` |

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
