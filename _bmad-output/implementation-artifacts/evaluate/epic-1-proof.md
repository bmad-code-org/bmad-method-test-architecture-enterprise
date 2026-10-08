# Epic 1 Proof: Evaluate authors its own suite (Story 1.16, AD-15; gaps closed in Story 1.46)

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

## Story 1.46: the gaps closed

Story 1.116's contract digest `sha256:3fbc635b6f9e0177feb0439becc40701d53d8e5797ae5874c42a4df74663058c` supersedes the digest `sha256:1592b16f…` recorded in this section, and its live PASS supersedes this section's.

Recorded 2026-10-03 by a maintainer session over `test/evaluations/bmad-testarch-evaluate/` through the local Claude Code CLI 2.1.288 (model `claude-sonnet-5`, no API key). The repairs were authored by a throwaway generator (`author.cjs`, session scratch, not committed), as Story 1.16's were; the loop's preflight, rerun and rescore ran live. The Stage 11 gap report for this run is the gitignored `test/eval-artifacts/evaluate/bmad-testarch-evaluate/gap-report.md` (`sha256:5e683480aa053d4db2d14bb687f7f1c645f90715da685bbfe132489ae5680e8f`); its G-1 to G-5 entries carry each gap's before and after outcome, invocation IDs and class component. The live legs ran from a standalone clone of the PR branch at commit `bced8a86`, a clean tree (`dirty: false`, `commit: bced8a86c7f7b72ec7c370239b9fe7d294677e47`), because the runtime refuses a run whose repository state changes mid-run and a lane worktree shares its refs with the other lanes (Story 1.112). Story 1.16's section above stays as found; this section holds the after state.

The live evidence measures the guides and runtime of commit `bced8a86`. Between that commit and the PR head two things moved. `main` changed `references/gaps.md` outside the exit table and the refusal sentence (`sha256:2c11a55e…` at `bced8a86`, the file the rollback digests below name; `sha256:74017abf…` at the head) and `references/evaluator.md`, which none of the evaluation's Stage 1 and Stage 11 steps read. It also changed eight `cli/` files (`agent-adapters.js`, `check.js`, `confinement-audit.js`, `confinement.js`, `records.js`, `registry.js`, `release-report.js` and `run.js`). The probes, mutations, scoring policy, corpus, `corpus-index.json` and the contract body, the exit-table rows, the web-application sentence and the refusal sentence are byte-identical, and only `requirements.md` and the two digests that pin it (`sourceSpecDigest` in the contract and `requirements.digest` in `evaluation.json`) changed, and the Stage 11 legs load all of `gaps.md`, so Story H.1's clean run, which runs at the merged head, is the measurement of that head. A review round then corrected `requirements.md` (the dirty-run sentence and the confirmation line) and restamped `sourceSpecDigest` and `requirements.digest` to `sha256:79298cd4fee0627785ac1e20dbac5870d5396b4d579c33a092692018e5839e62`; the live evidence predates that restamp and carries contract digest `sha256:1592b16f…`, which the restamp changed.

### Before and after

| Gap                                | Story 1.16 (before)                                    | Repair                                                                                                                                                                                                                   | After                                                                 |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| G-1 `success-indicator-separation` | unsatisfied, `critical`: no success indicator declared | the operation's `successIndicator` is `/status`, the answer fields carry roles (`payload`, `collection`, `diagnostic`), and every oracle reads `status` beside its answer fields in direction and check                  | satisfied                                                             |
| G-2 `malformed-input`              | unsatisfied, `critical`                                | step `refuse-no-exit` binds `type-violating` on the declared `stdin.exit` key (a number), O-004 reads the refusal and the absence of `class`; B-004 and probes P-008 (clean) and P-009 (seeded M-005)                    | satisfied                                                             |
| G-3 `per-record`                   | unsatisfied, `critical`                                | the operation declares `/exits` as a collection location; O-003's `for-all` tests each record's class                                                                                                                    | satisfied                                                             |
| G-4 `omission-and-completeness`    | unsatisfied, `critical`                                | that location names the reference set `exit-table` (thirteen ids); O-003's `covers-by-key` reconciles the records against it; B-003 and probes P-006 (clean) and P-007 (seeded M-004, the `tea-evaluate 13` row removed) | satisfied                                                             |
| G-5 B-002 seed                     | refused: the rule was stated four times                | the rule is stated once, in `references/inspection.md`; M-003 edits that sentence; probe P-005                                                                                                                           | `caught` 5 of 5                                                       |
| Verdict                            | `CONCERNS` in every artifact                           |                                                                                                                                                                                                                          | `PASS` in all nine artifacts, `coverageGaps` with no unsatisfied rule |

The drift Story 1.16 recorded is corrected: `requirements.md` names the JSON answer fields as evidence (digest `sha256:79298cd4fee0627785ac1e20dbac5870d5396b4d579c33a092692018e5839e62` in `evaluation.json` and `sourceSpecDigest`; the live run measured `sha256:6aec0ba2…`, the bytes before the review round's two sentence corrections), each seeded probe has its own defect ID (D-001 to D-005), `corpus/README.md` counts the rule's statements as one, and `assets/evaluation-folder.gitignore` lists `runs/`, `compiled-contract.json` and `sealed-brief.json`.

### Setup differences from Story 1.16

- `evaluation.json` declares `"confinement": false`. Under confinement a target's `HOME` is a private empty directory, the Claude Code CLI found no login there and every call exited 4 (observed in a first Stage 6 preflight, `20261003T145412771Z-9568bd09`, exit 12). The relay forbids an API key, so the runs record `confinement: opt-out`. Story 1.113 files the confined route.
- A first Stage 6 preflight from the lane worktree (`20261003T145729420Z-98e80eaa`) qualified four of the seeded probes and then exited 12: the adopter tree changed, because another lane committed to the shared repository during the run. Story 1.112 files it.
- Before the recorded run, the refuse step was exercised by hand on disposable copies of the skill: five of five replies `refused` with no class from the unmutated sentence and five of five `answered` with the class `evaluation weakness` from the mutated one; B-002 four of four `web` from the mutated sentence and three of three `api` unmutated. The first design of B-004 (a malformed `prompt`) never reached Stage 11's guide, so the type-violating value moved to a second key and the guide gained the sentence the seed edits.

### Commands and exit codes

From the clone root, in the order Stage 6 and Stage 10 run them:

| Command                                                                                        | Exit                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `node cli/evaluate.js digest --evaluation test/evaluations/bmad-testarch-evaluate`             | 0, `corpusDigest` `sha256:50b564e722e51423842946b5767bccabdcadc2f35686ba198e9664483ff757c3`                                             |
| `node cli/evaluate.js check --evaluation …`                                                    | 0                                                                                                                                       |
| `./node_modules/.bin/eval-quality compile --in …/contract.json --out …/compiled-contract.json` | 0                                                                                                                                       |
| `./node_modules/.bin/eval-quality seal --in …/contract.json --out …/sealed-brief.json`         | 0                                                                                                                                       |
| `node cli/evaluate.js preflight --evaluation …`                                                | 0, invocation `20261003T155723164Z-a2201e10`; five seeded probes qualified, each rollback proved                                        |
| `node cli/evaluate.js run --evaluation … --partition development`                              | 0, invocation `20261003T162233260Z-599729d9`, 71 min, eight trial sets of five over `clean`, `mutated:M-001`, `M-003`, `M-004`, `M-005` |
| `node cli/evaluate.js score --evaluation …`                                                    | 0, score invocation `20261003T173410940Z-532121a1`, eight probes each exit 0                                                            |
| `node cli/evaluate.js run --evaluation … --partition held-out`                                 | 0, invocation `20261003T173412495Z-030f1422`, 15 min, one trial set of five over `mutated:M-002`                                        |
| `node cli/evaluate.js score --evaluation …`                                                    | 0, score invocation `20261003T174952829Z-311b9016`, P-003 exit 0                                                                        |

### Outcomes

| Probe                      | Behavior | Class         | Outcome (5 trials, `validCount` 5) | Evidence artifact digest                                                  |
| -------------------------- | -------- | ------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| P-001                      | B-001    | clean control | `passed-clean-control` 5 of 5      | `sha256:e3c8a13332e691d9a9d2cab8c0b03d5c71f1781296701e05b3b23c43e8c47c3f` |
| P-002 (M-001, development) | B-001    | defect        | `caught` 5 of 5                    | `sha256:c44e132054796b9e839948ea690f7ab0b22448887bfa0237f9b606b682e5e4e9` |
| P-003 (M-002, held-out)    | B-001    | defect        | `caught` 5 of 5                    | `sha256:6a0a26194423ab278ad7647e731fff2d253928cdfc82c888eb443ac645ba64a0` |
| P-004                      | B-002    | clean control | `passed-clean-control` 5 of 5      | `sha256:64f9ace8673c6991790aac164ff1d99f80dd240397bb2f87b0f31553de5ca6c7` |
| P-005 (M-003, development) | B-002    | defect        | `caught` 5 of 5                    | `sha256:694f464ecb50c4b430e1260a9c11304182d0cd5e660396af974b43e0f721f5bd` |
| P-006                      | B-003    | clean control | `passed-clean-control` 5 of 5      | `sha256:5e16a6cf7cad7a66bcdd68c6067aaed924876e49ed9f078b36f2ab106af9eb80` |
| P-007 (M-004, development) | B-003    | defect        | `caught` 5 of 5                    | `sha256:7f38b64bb631a33db0a08a68f23dae8b87d3a786ce607ea6e842a2eb5951ae48` |
| P-008                      | B-004    | clean control | `passed-clean-control` 5 of 5      | `sha256:ba4fb15d3fd9b7096ebae259c6498b577d57d382b074d9daee9db710800a250c` |
| P-009 (M-005, development) | B-004    | defect        | `caught` 5 of 5                    | `sha256:d9a6d79ce2ec5008d835c46879e8cecf99e0b8fe3d8f2845025ffcc82e815514` |

Every artifact records `contractVerdict: PASS` and `exitCode: 0`. The development run's `strength-aggregate.json` reports the `defect` class at four eligible, four exercised, four caught, rate 1, comparable, against the declared floor 1.

Digests of the development run: contract `sha256:1592b16f7f14812fd1166d9b6c977f05205a06a8b8f8ca5fc23f735c5ee8e7ad`, sealed brief `sha256:3bb9bdfb0980d4464c021a9126046aaf028c2a20145f7816d6915815a8393e0d`, evaluator configuration `sha256:cdde306bd6739c99d6261254f002bb0ad1b23fdb9d8d4b672ab38bd2cc5c4823`, policy `sha256:3aa0032cf92e3ded04f4290499ae32f0a04ee5fad982a9ce4c25a18cdc348fc1`, `run.json` file `sha256:7238fac9dd2de110441fd6c3076408f8dada49e04ae15944ef446b2385f07a64`. The held-out run carries the same contract, brief, configuration and policy digests; its `run.json` file is `sha256:7772f9b3382e14fe8d12186ee95d6330b889679dde644678914fffccfb8f4610`.

### Rollback and independent re-score

Every qualification restored the target's bytes (restored digest equal to the pre-mutation digest, mutated unequal) and the baseline held on the first re-run. `references/gaps.md` before and after: `sha256:2c11a55e…` for M-001, M-002, M-004 and M-005 (one file, restored each time) and `references/inspection.md` `sha256:6edf888f…` for M-003.

The maintainer ran `eval-quality score` directly with each recorded call's arguments and a fresh `--out`: all nine artifacts reproduce byte for byte with exit 0, equal to the exit `tea-evaluate score` recorded.

## Story 1.116: each exit's class held against its AD-10 row

Recorded on the evening of 2026-10-04 (the invocation IDs carry UTC 2026-10-05) by the Story 1.116 live-run worker through the local Claude Code CLI 2.1.289 (model `claude-sonnet-5`, no API key), over PR #352.
Every command ran from a standalone clone of the PR branch at commit `6ff6384c0773ade3421a75e30c819a336b398a65`: `dirty: false`, workspace tree `a33b81f079c7730fa13c47fa7c504388b0354849`.
`git status --porcelain` in the clone was empty before and after every command.
Story 1.46's section above stays as found.
This section holds the live proof of the contract that superseded it.

### What changed

O-003 of the dogfood contract held each listed class against the table's class vocabulary (`for-all` over `set-membership`), so a complete listing that swapped the classes of `tea-evaluate 11` and `tea-evaluate 12` passed.
O-003's `for-all` predicate is now an `any` of one `all` pair of `equality` checks over `@/id` and `@/class` per row of the table.
The pairs of rows 11 and 12 compare the listed class with the `classify-exits` answer for the same exit, which O-001 holds to the table.
That scoping keeps the seeds M-001 and M-002 on O-001.
The contract digest moved from `sha256:1592b16f…` to `sha256:3fbc635b6f9e0177feb0439becc40701d53d8e5797ae5874c42a4df74663058c`, and `requirements.md` carries `sha256:266c9d3c4e7cb0d7de33c4f45ec0a04bd1c5438e7ec6ae0402d1de52cdbf3b59` in `evaluation.json` and `sourceSpecDigest`.
The corpus digest is `sha256:d653d6d927999d1a4a150c89357004366ecff5623a48479bbe6616086e2a3cf2`.

### Setup

- Engine: eval-quality 7.1.0, the release the `latest` devDependency resolves. TeA 1.27.2. Runner `tea-skill-runner`, `--agent claude`, `--capability read-only`, `--timeout-ms 300000`. Agent: Claude Code 2.1.289, model `claude-sonnet-5`, system prompt digest `sha256:f63c63e55cbb695cc5cfa8b18303d00fdf34ccf729ecfd2a93d3a9d9bbce5463`.
- `evaluation.json` declares `"confinement": false`, so every `run.json` records `confinement: opt-out`, as in Story 1.46.
- The runtime refuses a provisioned `node_modules` that is a symbolic link (exit 12 at workspace creation), so the clone holds a full copy of the lane checkout's `node_modules` (`cp -cR`). `_bmad/` is a copy of the lane checkout's gitignored `_bmad/`. Both are excluded through the clone's own `.git/info/exclude`, so the tree stays clean.
- Two earlier preflight attempts are discarded. `20261004T231826279Z-ee9e9c05` exited 12 at workspace creation with `ENOSPC` on a nearly full volume. `20261004T235010021Z-501aa7fa` was stopped before it finished, and the clone's `node_modules` was recopied in full. The recorded commands below all ran after that, with 43 GiB or more free.

### Commands and exit codes

From the clone root, in the order Stage 6 and Stage 10 run them, with `--evaluation test/evaluations/bmad-testarch-evaluate`:

| Command                                                                                        | Exit                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `node cli/evaluate.js digest --evaluation …`                                                   | 0, `corpusDigest` `sha256:d653d6d927999d1a4a150c89357004366ecff5623a48479bbe6616086e2a3cf2`                                             |
| `node cli/evaluate.js check --evaluation …`                                                    | 0                                                                                                                                       |
| `./node_modules/.bin/eval-quality compile --in …/contract.json --out …/compiled-contract.json` | 0, output `sha256:3fbc635b6f9e0177feb0439becc40701d53d8e5797ae5874c42a4df74663058c`                                                     |
| `./node_modules/.bin/eval-quality seal --in …/contract.json --out …/sealed-brief.json`         | 0, output `sha256:b3a3820bb44ffbf2b44a41413015f5551f8fffa212ae68e2989c13215533abdb`                                                     |
| `node cli/evaluate.js preflight --evaluation …`                                                | 0, invocation `20261005T001017502Z-fbe06c57`, 26 min; five seeded probes qualified, each rollback proved                                |
| `node cli/evaluate.js run --evaluation … --partition development`                              | 0, invocation `20261005T003657999Z-c6f9a76e`, 79 min, eight trial sets of five over `clean`, `mutated:M-001`, `M-003`, `M-004`, `M-005` |
| `node cli/evaluate.js score --evaluation … --run 20261005T003657999Z-c6f9a76e`                 | 0, score invocation `20261005T015550152Z-a9e17e05`, eight probes each exit 0, strength aggregate exit 0                                 |
| `node cli/evaluate.js run --evaluation … --partition held-out`                                 | 0, invocation `20261005T015558266Z-4ae4d54a`, 17 min, one trial set of five over `mutated:M-002`                                        |
| `node cli/evaluate.js score --evaluation … --run 20261005T015558266Z-4ae4d54a`                 | 0, score invocation `20261005T021259920Z-f8920bca`, P-003 exit 0, strength aggregate exit 0                                             |

The compile and seal outputs are derived files and are not committed.
The Stage 6 preflight's own `run.json` records `command: preflight`, `commit: 6ff6384c…`, `dirty: false` and `adopterTree.unchanged: true`, and its verdict file `preflight-verdict.json` records `passed: true` with all fourteen checks `satisfied` (`seeded-faults-scoped` and `seeded-fault-fired` for each of D-001 to D-005, beside `interface-present`, `input-sensitivity`, `state-reset` and `clean-control`).

### Outcomes

Each probe ran five trials with `validCount` 5, and every evidence artifact records `contractVerdict: PASS`, `exitCode: 0` and no coverage gap.
The oracle columns come from each artifact's `outcomes` array (five trials of four oracles each).

| Probe                      | Behavior | Class         | Outcome                       | Violated oracles | Corroboration               | Evidence artifact digest                                                  |
| -------------------------- | -------- | ------------- | ----------------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------- |
| P-001                      | B-001    | clean control | `passed-clean-control` 5 of 5 | none             | `agrees` in all 20 outcomes | `sha256:44c90a305dec6bb775cf1dff422cf52864477b4bd069cb48e81b3acb36816c11` |
| P-002 (M-001, development) | B-001    | defect        | `caught` 5 of 5               | O-001            | `agrees` in all 20 outcomes | `sha256:daf199174c50df17849ea5e88f98092d00b1a0532600cd9cc20ef266138bb4b4` |
| P-003 (M-002, held-out)    | B-001    | defect        | `caught` 5 of 5               | O-001            | `agrees` in all 20 outcomes | `sha256:5cdcce6313c3ba4ed5456a8282bfb8a085e5da3e72772fd08587e151f9cd94b0` |
| P-004                      | B-002    | clean control | `passed-clean-control` 5 of 5 | none             | `agrees` in all 20 outcomes | `sha256:998581056823848eacdae61918d9cded8f8cdab74df67cdad38d97955f5e70d8` |
| P-005 (M-003, development) | B-002    | defect        | `caught` 5 of 5               | O-002            | `agrees` in all 20 outcomes | `sha256:4e4f5b749222265e3ad40678b19720617231346f3a9f64222b8d6ce981d06ade` |
| P-006                      | B-003    | clean control | `passed-clean-control` 5 of 5 | none             | `agrees` in all 20 outcomes | `sha256:2db757027066dff302d0138769d5d0f704ac0de368af267ec9ac115c139b81de` |
| P-007 (M-004, development) | B-003    | defect        | `caught` 5 of 5               | O-003            | `agrees` in all 20 outcomes | `sha256:2439ff7be8326b41f12663f58b9ed9ffa721dc6385d20157d6872c3c132b8750` |
| P-008                      | B-004    | clean control | `passed-clean-control` 5 of 5 | none             | `agrees` in all 20 outcomes | `sha256:4b875f0339c6c8b21d9a1c52f8128292fd5544ca82b3d0624bdd2b1f23d91d83` |
| P-009 (M-005, development) | B-004    | defect        | `caught` 5 of 5               | O-004            | `agrees` in all 20 outcomes | `sha256:4e9eebd811695ba183b31fcdb8757a7ee40ae7fa34b9f38d2c222be4c78d3ed4` |

No outcome of any artifact reads `disagrees`.
O-003 is violated on P-007 alone, where M-004 removes row 13 from the table.
O-003 reads `held` in all 40 trials of the other eight probes, so the `list-exit-table` listing and the `classify-exits` answer for rows 11 and 12 agreed across the independent model calls of every trial, on the four clean controls and on the seeds M-001 and M-002.
The development run's `strength-aggregate.json` reports the `defect` class at four eligible, four exercised, four caught, rate 1, comparable, against the declared floor 1, decision `meets`.

### Digests

| Artifact                       | Digest                                                                    |
| ------------------------------ | ------------------------------------------------------------------------- |
| Contract (`contractDigest`)    | `sha256:3fbc635b6f9e0177feb0439becc40701d53d8e5797ae5874c42a4df74663058c` |
| Sealed brief                   | `sha256:b3a3820bb44ffbf2b44a41413015f5551f8fffa212ae68e2989c13215533abdb` |
| Evaluator configuration        | `sha256:53efabdca1f1cacc9417653a64e51f93f36706911eed7813fa8f2777c12cc4dc` |
| Policy                         | `sha256:3aa0032cf92e3ded04f4290499ae32f0a04ee5fad982a9ce4c25a18cdc348fc1` |
| Stage 6 preflight verdict file | `sha256:a5c50e9d7707212385021ae97b4dcd0be434463e431c0b759b011196222e1eaf` |
| Stage 6 preflight `run.json`   | `sha256:d94080f900f54f019a0eab9e42e0e1b30c2b8347749acd637a6830eb6f2f00a9` |
| Development `run.json` file    | `sha256:957acc487da24d4b2522f9d571372f59268b4c1e390f75eac3e2fc6e40f8440a` |
| Held-out `run.json` file       | `sha256:5092bdfa4101d628c8cf381e016f145f932b771715ae440706a4abdea57cdcd1` |

The development and held-out runs carry the same contract, sealed brief, evaluator configuration and policy digests.
The policy digest equals Story 1.46's.
Both runs record `command: run`, `teaVersion: 1.27.2`, `evalQualityVersion: 7.1.0`, `commit: 6ff6384c…`, `dirty: false`, `confinement: opt-out`, `adopterTree.unchanged: true`, `refused: []` and `model.modelSnapshot: claude-sonnet-5`.

### Rollback

Every qualification, in the Stage 6 preflight, the development run and the held-out run, restored the target's bytes: restored digest equal to the pre-mutation digest, mutated digest unequal, and the baseline `held` on attempt 1 of `reExecutionCap` 2.
`references/gaps.md` is `sha256:800dc1224c4520eea0fba96865eec5a701df30868a3bc809aa33c0ec73e586fd` before and after for M-001, M-002, M-004 and M-005 (one file, restored each time).
`references/inspection.md` is `sha256:6edf888fd74f25dd745df5bfc91ac6975d8b9fce940b3da7d229a36c62366d7a` before and after for M-003.
The mutated digests are `sha256:cb372c9f…` (M-001), `sha256:4986c039…` (M-002), `sha256:c98bdb82…` (M-003), `sha256:df39bc2c…` (M-004) and `sha256:f50586d0…` (M-005).
`gaps.md` was `sha256:2c11a55e…` at Story 1.46's measured commit, and `main` has changed it since.

### Independent re-score

The worker ran eval-quality directly, outside `tea-evaluate`, with each recorded call's arguments (the `argv` that each probe's `score.json` records, with the `--record`, `--contract`, `--probe`, `--preflight-verdict`, `--policy`, `--corpus-digest`, `--isolation-manifest` and `--evaluator-configuration` values unchanged) and a fresh `--out` under the session scratchpad.
It compared `shasum -a 256` and the exit code with the files `tea-evaluate score` wrote.
All nine artifacts reproduce byte for byte with exit 0, equal to the exit `tea-evaluate score` recorded.

## Kept for Epic 2

`test/evaluations/bmad-testarch-evaluate/runs/` holds all four invocations in the worktree, gitignored. `compare --accept` must refuse them as dirty (Story 2.1); Story H.1 records the clean baseline.

## Story 2.1: the retained dirty run is refused

Story 2.1 ran `compare --accept` read-only against the retained invocation `20260928T165418209Z-f89a3a6b` in the main checkout's `test/evaluations/bmad-testarch-evaluate`, with the Story 2.1 branch's CLI. The run records `dirty: true`, so the command refuses it before it stages or writes a byte:

```sh
node cli/evaluate.js compare --evaluation test/evaluations/bmad-testarch-evaluate --accept --run 20260928T165418209Z-f89a3a6b
```

```text
tea-evaluate compare: accepting run 20260928T165418209Z-f89a3a6b
run.json: [dirty] records dirty true; a run measured over uncommitted work is never accepted as a baseline
tea-evaluate compare: run 20260928T165418209Z-f89a3a6b is dirty; nothing was written under baseline/ (exit 10, test/evaluations/bmad-testarch-evaluate/runs/20260928T165418209Z-f89a3a6b)
```

Exit 10. The folder holds no `baseline/` and no staging directory afterwards, and `git status` over `test/evaluations/` is unchanged. This is the expected overnight state: the baseline for `bmad-testarch-evaluate` stays absent until Story H.1 records one from a clean run.
