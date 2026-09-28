# Epic 1 Proof: Evaluate authors its own suite (Story 1.16, AD-15)

Recorded 2026-09-28 on branch `feat/evaluate-1-16`, from the working tree (`--from-working-tree`), so every run is `dirty: true`. Story H.1 replaces it with a clean run on the merged tree.

## Result

| Item                             | Value                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight                        | `passed: true`: eight checks satisfied in the Stage 6 preflight, and six in each run's own preflight, which qualifies one seeded probe                                    |
| P-001, clean control, B-001      | `passed-clean-control` in 5 of 5 trials                                                                                                                                   |
| P-004, clean control, B-002      | `passed-clean-control` in 5 of 5 trials                                                                                                                                   |
| P-002, seeded M-001, development | `caught` in 5 of 5 trials, `caughtCount / validCount` 1 > `catchThreshold` 0.6, at `minimumTrialCount` 5                                                                  |
| P-003, seeded M-002, held-out    | `caught` in 5 of 5 trials, read through `gap-view.json`                                                                                                                   |
| Contract verdict                 | `CONCERNS` in every evidence artifact, exit 0: four coverage rules unsatisfied, recorded as found below                                                                   |
| Rollback                         | both mutations: mutated digest unequal to pre-mutation, restored digest equal, baseline re-passed on the first attempt                                                    |
| Adopter tree                     | `git status --porcelain` identical before and after; `gaps.md` digest unchanged; every `run.json` after the refused first preflight records `adopterTree.unchanged: true` |
| Independent re-score             | `eval-quality score` from `node_modules/.bin` reproduces all four evidence artifacts byte for byte, with the same exit codes                                              |

The verdict is not PASS, so the result is recorded as found, with the gaps Evaluate named. The run is recorded once.

## Setup

- TEA is not installed into its own repository. The gitignored `_bmad/tea/config.yaml` holds `user_name: Murat`, `communication_language: English`, `test_artifacts: test/eval-artifacts` and `tea_evaluations_folder: test/evaluations`. The skill loads it at activation Step 4 from `{project-root}`, the nearest ancestor holding `_bmad/`.
- The runner-driven arms get TEA config the way the existing runners do: `cli/lib/resolve-tea-config.js` reads `_bmad/tea/config.yaml` from the project root the runner works in. `evaluation.json` provisions `_bmad` (and `node_modules`, for the runner's own dependencies) read-only into each disposable workspace, so the skill reads that file at the root of the copy it runs in.
- The skill was invoked by path: the maintainer session read `src/workflows/testarch/bmad-testarch-evaluate/SKILL.md` and walked its stages, answering intake from `_bmad-output/planning-artifacts/evaluate/SPEC.md`. TeA's own package takes the stage guides' repository-root branch: `node cli/evaluate.js` and `./node_modules/.bin/eval-quality`, with no private `test/evaluations/package.json`.
- Engine: eval-quality 4.3.0, the release the `latest` devDependency resolves. TeA 1.27.2. Runner: `tea-skill-runner` at `cli/skill-runner.js` in the workspace, `--agent claude`, `--capability read-only`, `--timeout-ms 300000`. Agent: Claude Code 2.1.283, model `claude-sonnet-5`, a fixed condition. The engine export check exits 0.
- Working drafts, gitignored under `test_artifacts`: `test/eval-artifacts/evaluate/bmad-testarch-evaluate/inspection-record.md` (`sha256:69a128b6…7f5`), `requirements-statement.md` (`sha256:b1e246bf…54b`, the same bytes as the committed `requirements.md`) and `gap-report.md` (`sha256:414f9dd6…d64`).

## What Evaluate authored

The maintainer session wrote the folder's JSON through a throwaway generator, `/tmp/ev116/author.cjs`, so each prompt, schema and literal that recurs across the contract, probes and witnesses is spelled once. The generator is not committed; the committed files are the authored artifacts `tea-evaluate check` guards.

`test/evaluations/bmad-testarch-evaluate/`: `evaluation.json`, `requirements.md`, `contract.json`, `probes/P-001` to `P-004`, `mutations/M-001` and `M-002`, `corpus/README.md`, `corpus-index.json`, `policy/scoring-policy.json`, `policy/evaluator-conditions.json` and the evaluation-folder `.gitignore`.

- **B-001 (material):** Stage 11 names the AD-10 class of a failed `tea-evaluate` command. The `classify-exits` step asks about a `run` that exited 11 and a `preflight` that exited 12; O-001 requires `exit11: "evaluation weakness"` and `exit12: "infrastructure"`.
- **B-002 (critical):** Stage 1 classifies a web application with no AI features. The `classify-web-app` step's O-002 requires `targetKind: "ai-feature"` and `interface: "api"`.
- **Observable channel (AD-19):** each request holds the reply to one JSON object through claude's `--json-schema`, passed by the runner's `--agent-arg`. The oracles and signatures read named fields of the runner's stdout. The free-text `basis` field is the one volatile pointer, so preflight's `state-reset` compares the answers alone. A first design without the schema printed prose before the JSON in about one reply in fourteen, which would have failed `state-reset` and the oracles' pointers.
- **Single source (mutation guide, R1-23):** the AD-10 class of each `tea-evaluate` exit is stated once in the skill, in the exit table of `references/gaps.md`. M-001 swaps the class of the exit 11 row to `infrastructure`; M-002, held out, swaps the exit 12 row to `evaluation weakness`. B-002's seed is refused: its rule is stated four times, in the prose and the table of both `references/inspection.md` and `references/adapters.md`. `corpus/README.md` counts three, missing the `adapters.md` table; Story 1.46 corrects it.
- **Policy:** `severityFloor: material`, `minimumTrialCount: 5`, `catchThreshold: 0.6`, `trials: 5`. A sampled model needs repeat trials; the answer fields were stable across 28 manual calls made with a JSON-only prompt and no schema flag, and 0.6 tolerates one miss in five while the strict rule still fails three in five.
- **System prompt digest:** `sha256:f63c63e5…463`, eval-quality's `digestBytes` over the runner's fixed preamble (`skillPrompt(skillRoot, '')`), the one prompt text the adopter controls. Claude Code's own system prompt is part of the fixed agent condition.

## Manifestation confirmed before the recorded run

Once, on disposable copies of the skill and `_bmad/` under `/tmp` (`/tmp/ev116-manifest-s4UF` for M-001, `/tmp/ev116-manifest-m2-ZPq7` for M-002), with `node cli/skill-runner.js --skill-root src/workflows/testarch/bmad-testarch-evaluate --agent claude --model claude-sonnet-5 --capability read-only --timeout-ms 300000` and the `classify-exits` prompt asking for JSON, before the `--json-schema` flag was added (the recorded runs then qualified both mutations again with the flag):

- M-001 copy: `{"exit11":"infrastructure","exit12":"infrastructure"}` in 4 of 4 replies; one of them printed a prose line before the JSON.
- M-002 copy: `{"exit11":"evaluation weakness","exit12":"evaluation weakness"}` in 4 of 4.
- Unmutated repository: `{"exit11":"evaluation weakness","exit12":"infrastructure"}` in 8 of 8; the web application `{"targetKind":"ai-feature","interface":"api"}` in 4 of 4.

## Commands and exit codes

From the repository root, in the order the skill's Stage 6 and Stage 10 run them:

| Command                                                                                        | Exit                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `node cli/evaluate.js digest --evaluation test/evaluations/bmad-testarch-evaluate`             | 0, `corpusDigest` `sha256:d4ddeaf730604b1e72a468c5935f6f7853e4c0e6b1fba4f565c0de377a741256` |
| `node cli/evaluate.js check --evaluation test/evaluations/bmad-testarch-evaluate`              | 0                                                                                           |
| `./node_modules/.bin/eval-quality compile --in …/contract.json --out …/compiled-contract.json` | 0, output `sha256:7dc88dfc…5e4`                                                             |
| `./node_modules/.bin/eval-quality seal --in …/contract.json --out …/sealed-brief.json`         | 0, output `sha256:d1bb4438…3b2`                                                             |
| `node cli/evaluate.js preflight --evaluation … --from-working-tree`                            | 0, invocation `20260928T164406204Z-2d47806f`                                                |
| `node cli/evaluate.js run --evaluation … --from-working-tree --partition development`          | 0, invocation `20260928T165418209Z-f89a3a6b`, 26 min                                        |
| `node cli/evaluate.js score --evaluation … --run 20260928T165418209Z-f89a3a6b`                 | 0; P-001, P-004 and P-002 each exit 0                                                       |
| `node cli/evaluate.js run --evaluation … --from-working-tree --partition held-out`             | 0, invocation `20260928T172058296Z-10c3eca0`, 14 min                                        |
| `node cli/evaluate.js score --evaluation … --run 20260928T172058296Z-10c3eca0`                 | 0; P-003 exit 0                                                                             |

The compile and seal outputs are derived files and are not committed. An earlier Stage 6 preflight, `20260928T163644892Z-f3b20d39`, exited 12: the maintainer edited `test/evals/suite-manifest.json` while it ran, and the runtime refused the qualification because the adopter tree changed. Both mutations had qualified in it. Every later command ran with the tree untouched.

## Digests

| Artifact                          | Digest                                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| Contract (`contractDigest`)       | `sha256:ac3301fe85d42e2cfaa86c1e92abe8c5cc2b646a32cb82a31f7b2c27a1902610` |
| Corpus (`corpusDigest`)           | `sha256:d4ddeaf730604b1e72a468c5935f6f7853e4c0e6b1fba4f565c0de377a741256` |
| Requirements (`sourceSpecDigest`) | `sha256:b1e246bffd06e8dff03fa6c4c03a1dac53b6d94b3a925bd72a49f5dbccec054b` |
| Sealed brief                      | `sha256:def75a6186373fbd7d40e39a39fa21a27d0e6417eb5b15a9852f82c8b3d8e3b3` |
| Evaluator configuration           | `sha256:d7e034976324b887a7aa7c7d889733a86cf7e138735eeab227eb2add513424dc` |
| Policy                            | `sha256:3aa0032cf92e3ded04f4290499ae32f0a04ee5fad982a9ce4c25a18cdc348fc1` |
| Workspace tree                    | `sha256:eea3b67e785aa6904f39055cad3de21567096a144c9b5906dfbce7d83a923755` |
| Stage 6 preflight verdict file    | `sha256:f650d4a629b4c8de6db747ee13d1d582a489b96ed6b7c5d924fae98ad3c25920` |
| Development `run.json` file       | `sha256:a2302f840baf8e591579a7c068d52031f32b7063e839fed2d4753a3766a936fd` |
| Held-out `run.json` file          | `sha256:5073b60986390d1b5cab6ca37ff9e4a36ac53f44b697500e97100db3c6a5b319` |

## run.json

Both runs record `command: run`, `teaVersion: 1.27.2`, `evalQualityVersion: 4.3.0`, `commit: null`, `dirty: true`, `workspace.kind: copy`, `adopterTree.unchanged: true`, `refused: []`, the runner `evaluate-skill` / `tea-skill-runner` / `cli/skill-runner.js`, the deterministic evaluator, `model.modelSnapshot: claude-sonnet-5`, `judge: null`, `trialCount: 5` and `completed: true`. The development run's arms are `clean` and `mutated:M-001`; the held-out run's arm is `mutated:M-002`.

## Rollback evidence

Target artifact `src/workflows/testarch/bmad-testarch-evaluate/references/gaps.md`; `shasum -a 256` in the worktree before and after the runs: `16c4fd7bc81de1a238bdd38541c8a75e136bec6e51428e6d78884881967bcf93`.

| Mutation      | `preDigest`             | `mutatedDigest`                                                           | `restoredDigest`        | Baseline re-pass                          |
| ------------- | ----------------------- | ------------------------------------------------------------------------- | ----------------------- | ----------------------------------------- |
| M-001 (P-002) | `sha256:16c4fd7b…bcf93` | `sha256:ca5b57b5cc0d4f32e41ae9a27b1db6e1b619bec852e6340c2a37b5cdea0824a3` | `sha256:16c4fd7b…bcf93` | `held` on attempt 1 of `reExecutionCap` 2 |
| M-002 (P-003) | `sha256:16c4fd7b…bcf93` | `sha256:3df872ed8bdf8052ec2be54a3f62ed232fabeda9cbf634a2915f35b111526c55` | `sha256:16c4fd7b…bcf93` | `held` on attempt 1 of `reExecutionCap` 2 |

## Independent re-score

For each trial set in the run's `trial-sets.json`, the maintainer ran eval-quality directly, outside `tea-evaluate`, writing the artifact to `/tmp` and comparing `shasum -a 256` and the exit code with the files `tea-evaluate score` wrote:

```sh
./node_modules/.bin/eval-quality score --record <run>/trial-sets/<probe>/record-1.json … --record <run>/trial-sets/<probe>/record-5.json \
  --contract <run>/eval-contract.json --probe <run>/probes/<probe>.probe.json --preflight-verdict <run>/preflight-verdict.json \
  --policy <run>/scoring-policy.json --corpus-digest <corpusDigest> --isolation-manifest <run>/trial-sets/<probe>/isolation-manifest.json \
  --evaluator-configuration <run>/evaluator-configuration.json --out /tmp/ev116/proof/rescore-<run>/<probe>.json
```

| Probe | Direct exit | `tea-evaluate` exit | Evidence artifact, both                                                   |
| ----- | ----------- | ------------------- | ------------------------------------------------------------------------- |
| P-001 | 0           | 0                   | `sha256:8df27be80a83ef7fe2dc5c14366d876ccff0b81129f9b4613edf306f99ec5e4e` |
| P-004 | 0           | 0                   | `sha256:2ccb0f66c8a74a7afc977770b24a4be44b4eacbdb7f385b0e4d0108b85f4541d` |
| P-002 | 0           | 0                   | `sha256:271f4e0b4733fba43c3790f54b5ce8e6cfad0bc89c525be07a99a34d486eacd4` |
| P-003 | 0           | 0                   | `sha256:fa8d5d415b297e9c9bd81c860866b80a9597c649c1072f3f2aa921db6de8142f` |

## Gaps Evaluate named

The gitignored `gap-report.md` draft numbers the four engine rules G-1 to G-4 and lists B-002's missing seed separately; this record numbers that item G-5.

Stage 11, read through `references/gaps.md`, from the development evidence and the held-out `gap-view.json`:

| Gap | Engine evidence                                      | Repair                                                                                                                                   |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G-1 | `success-indicator-separation` unsatisfied, critical | Add a probe and oracle that read independent success evidence, not the target's success claim alone                                      |
| G-2 | `malformed-input` unsatisfied, critical              | Add malformed-input probes and an oracle for rejection before side effects: an exit the table does not list, or a request naming no exit |
| G-3 | `per-record` unsatisfied, critical                   | Add a multi-record probe and per-record oracle evidence pointers: the two classified exits as a declared collection                      |
| G-4 | `omission-and-completeness` unsatisfied, critical    | Add a missing-item probe and an oracle that checks the complete required set: every exit the table lists                                 |
| G-5 | B-002 has no seeded or held-out probe                | Its rule is stated four times across two guides; seeding it needs a single source                                                        |

The run-wide class gate is unavailable: `tea-evaluate score` calls eval-quality once per probe, so `strengthFloor` is not assessed across probes (Story 1.45). Each defect artifact's own class component is `rate: 1` with `comparable: true`. Closing G-1 to G-5 changes the contract and needs a new run, which Story 1.46 owns.

## Drift recorded for Story 1.46

- `requirements.md`, under "Admissible evidence", still describes fixed answer lines, the design before the JSON replies. The file is digested as `sourceSpecDigest`, so correcting it needs a new run.
- P-002 and P-003 both name their defect `D-001`, so the preflight verdict's two `seeded-faults-scoped` and `seeded-fault-fired` notes do not say which probe each belongs to.
- `corpus/README.md` counts three statements of the web-to-`api` rule; the skill has four.
- The skill's `assets/evaluation-folder.gitignore` ignores only `runs/`, while Stage 6 writes `compiled-contract.json` and `sealed-brief.json` into the folder. This evaluation's `.gitignore` adds both; the asset does not yet.

## Kept for Epic 2

`test/evaluations/bmad-testarch-evaluate/runs/` holds all four invocations in the worktree, gitignored. `compare --accept` must refuse them as dirty (Story 2.1); Story H.1 records the clean baseline.
