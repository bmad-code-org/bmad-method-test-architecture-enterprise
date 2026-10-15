---
name: Exploratory candidate contract
type: adr
status: accepted
created: 2026-10-14
scope: Evaluate discovery lane, feature F01 of the Evaluate discovery plan, first slice
binds: [AD-6, AD-8, AD-9, AD-22, AD-23]
sources: [ARCHITECTURE-SPINE.md]
---

# ADR: Exploratory candidate contract

## Context

Evaluate qualifies a mutation only when the clean arm passes, the mutated arm violates an oracle the contract already declares, the restored bytes match, and a recovered clean run passes (AD-8 in `ARCHITECTURE-SPINE.md`). A proposed edit that no declared oracle can demonstrate cannot meet that bar, however undesirable the behavior it changes. Discovery needs a place to hold such an edit, the observations made when it ran, the independent evidence that its behavior is wrong and the review decision, with none of it reaching a score.

This record covers the first slice of the Evaluate discovery plan (14 October 2026): the contract, its reader, the boundary guards and their tests. It adds no generator, no `tea-*` command and no live call.

Inspecting the current code corrected the plan in these places:

- The plan was written against TeA 3.0.0 and a main at `d2408d6c`. This record is written against v3.0.2 (see Pinned versions and sources). `git diff 988415514a7f9f82fb0eaa69e9e88e7359b2dd71 HEAD -- cli/lib/evaluate skills/bmad-tea-evaluate` is empty at the pin, so every module the plan names is byte-identical to the 3.0.0 release.
- No gap-loop module exists under `cli/lib/evaluate/`. The loop is the skill's `gaps.md` guide reading `gap-view.json`, which `partition.js` writes through `writePartitionViews`.
- The plan's terminal state `judge-error` is also an eval-quality outcome. The candidate vocabulary spells it `judge-failure`, so no candidate state reads as a native outcome.
- Mutation checks live in `check.js` (`checkMutations`) and `mutation.js` (`planReplaceExact`). Both accept only `replace-exact` with exactly one occurrence, which the candidate edit mirrors.
- `evaluation.json` is closed at the top level, and `mutations/` and `probes/` accept only `M-NNN.mutation.json` and `P-NNN.probe.json`. The corpus index covers `corpus/`, `probes/` and `mutations/` (AD-9). Before this change `check` ignored a file in any other directory of the folder, including `evaluator/`, `policy/`, `baseline/` and the folder root, whatever its content.

## Decision

A candidate is one JSON record at `<evaluation-folder>/discovery/<campaignId>/C-NNN.candidate.json`, described by `cli/lib/evaluate/discovery/candidate.schema.json` (schema version 1, `recordKind: exploratory-candidate`). `cli/lib/evaluate/discovery/candidate.js` holds the reader, the canonical writer, the identity and the draft promotion. The schema sits beside the reader. `cli/lib/evaluate/schemas/` keeps the schemas of native artifacts.

A record holds:

- the edit: `find`, `replace`, exactly one occurrence, the target file spelled as a mutation spells `targetArtifact`, and eval-quality's `digestBytes` of that file before the edit;
- the reason: a hypothesis, an intent (`regression` or `robustness`), the generator's name, version and seed, and the path and digest of `requirements.md` as `evaluation.json` records them;
- the lifecycle `state`: `generated`, `applicable`, `observed`, `reviewed` or `promoted`. A generated or applicable candidate has no observation, review or promotion; an observed one has observations; a reviewed one has a review; a promoted one has a promotion;
- a `disposition`, empty until something stops or concludes the candidate: `generation-error`, `inapplicable`, `binding-not-consumed`, `unexercised`, `target-error`, `judge-failure`, `budget-exhausted`, `observationally-unchanged`, `undetermined`, `confirmed-undesirable-caught` or `confirmed-undesirable-missed`. A review concludes with `inapplicable`, `observationally-unchanged`, `undetermined` or one of the two confirmed values;
- observations: per arm (`baseline` or `candidate`), the digest of the recorded evidence and the planned, completed, errored and missing trial counts. A confirmed disposition needs an observation on each arm with at least one completed trial;
- independent evidence: a domain invariant, a separate specification, a verified historical defect, a reference computation or a blinded human annotation, each a snapshot of the material the reviewer saw at `discovery/<campaignId>/evidence/<file>` with eval-quality's `digestBytes` of it. A source outside the folder is archived there and a human annotation is recorded there as written. A second call to the same judge has no kind. The reader refuses evidence whose digest equals the requirement's, the target's or an observation's, and `readCandidate` refuses a snapshot that is missing, empty, reached through a link or digests to another value;
- the review (reviewer, `decidedAt`, rationale, scope), an optional accepted risk, and a promotion.

A promotion names the draft `M-NNN` mutation and, once a native qualification exists, a reference to the mutated arm's evidence: a `baseline/qualification/<probeId>/mutated-fail.json` path, the file a native qualification writes, and eval-quality `digestBytes`. `readCandidate` holds the link to the native qualification of the draft: the receipt exists with that digest and states the probe, the mutation and the target with the phase `mutated-fail` and the verdict `violated`; `baseline-pass.json` beside it states the same probe, mutation and target with the verdict `held` over the target digest the record names; `rollback.json` states a verified rollback that restored that digest and mutated to the receipt's digest; `probes/<probeId>.probe.json` takes the `controlled-mutation` route through the draft mutation; `mutations/<draftMutationId>.mutation.json` is a native mutation file whose target and `replace-exact` operator equal the candidate's edit, and the accepted baseline's qualified probe `baseline/probes/<probeId>.probe.json` records the candidate's operator and target digest, a verified rollback, and the digests of the baseline-pass and mutated-fail evidence. An arm's evidence holds oracle results that decide its verdict, the rollback ends with a restored arm that held, and a `fault.json` beside the evidence refuses the chain. The candidate carries no verdict of its own, and the native qualification stays the only thing that scores. `draftMutation` renders the draft as the native `replace-exact` mutation file, and `tea-evaluate check` accepts it like any authored mutation.

The record serializes with sorted keys at every depth, two-space indent and one trailing newline. Parsing canonical bytes and serializing the result returns the same bytes.

Authoring follows `skills/bmad-tea-evaluate/references/authoring-routing.md` unchanged. A worker proposes a candidate as text with file and line evidence, the parent writes the record and the parent runs every gate. The authoring log stays outside `discovery/`, `corpus/`, `probes/`, `mutations/` and `runs/`.

Answers to the plan's open decisions, chosen conventionally for the offline work:

- Labeled bundle and reviewer: the red-phase fixture under `test/fixtures/evaluate/valid` supplies the target path and requirements; a repository maintainer reviews whether a candidate is undesirable.
- Budget and data policy: offline work needs none. A live run needs an approved budget and data policy before its first dispatch.
- Candidate versus native contract: approved as written here. No calculation moves into eval-quality.
- Python interoperability: not built.
- Gating: no discovery result gates CI. Results are advisory evidence for review.

## Compatibility boundary

Schemas. The runtime's `evaluation`, `mutation` and `committed-probe` schemas are closed at the top level, and every schema eval-quality publishes refuses a candidate record. The candidate schema is closed and requires `recordKind`, so a native document fails it. Candidate identifiers (`C-NNN`) match none of the native identifier patterns.

Files. `tea-evaluate check` has one added rule, `candidate-placement`: a `*.candidate.json` file anywhere in the folder outside its top-level `discovery/` directory is refused, so a candidate cannot be digested into the corpus, the evaluator layer, the policy or the baseline. The scan skips the top-level `runs/` and `node_modules/` directories, which hold runtime output and installed packages, follows no link, and leaves the held-out folder unopened in exactly the cases the corpus index does (a development check of an evaluation with a held-out plan, in any letter case). A candidate renamed as a mutation or probe fails that schema. An `evaluation.json` carrying candidate fields fails its closed schema, and a probe qualified by a candidate ID fails `id-pattern`. `discovery/` is outside the corpus index, so the findings of `check`, the output of `digest` and `corpus-index.json` are identical with and without candidates. No schema, verdict or exit code changes.

Verdicts. No state or disposition equals an eval-quality outcome, verdict or qualification failure. A review that confirms a defect records `confirmed-undesirable-caught` or `confirmed-undesirable-missed`, which describe the candidate. A candidate record has no field that names a native probe, outcome or denominator, so a review has nothing to reclassify; an already-qualified probe missed in a later trial keeps its native outcome.

Modules. The `discovery-import` rule of `test/test-evaluate-boundaries.js` parses every file under `cli/`: nothing outside `discovery/` loads it, no string literal outside it other than `check.js` names the `discovery` directory, and `discovery/` loads `node:fs`, `node:path`, `node:crypto`, `ajv/dist/2020`, `digest.js` and `formats.js` only. The scored runtime cannot read a candidate and the candidate code reaches no module that decides a score or reads a run (AD-6, AD-23).

CLI. No command, flag, exit code or output changes beyond the `candidate-placement` finding. A `discover` command group has to read and write only under `discovery/`, report an unsupported candidate schema version by name, and map no candidate state to an exit code of `check`, `run`, `score` or `compare`.

Native schema changes. Adding a candidate field to a native artifact, or a native term to a candidate, fails `test/test-evaluate-discovery.js`: each candidate property is classified as shared with a native schema or candidate-only, candidate-only names must appear in no native schema or fixture, and no native key may contain `candidate` or `discovery`. A scoring change needs its own eval-quality policy review. Verdict behavior stays pinned by the existing scoring, partition and comparison suites, which run unchanged and cannot reach the candidate module.

## Partitions

A candidate records `partition: development` and the schema allows no other value. Discovery reads development evidence only. It opens none of `corpus/held-out/`, the held-out plan or held-out results, so a candidate cannot expose held-out content (AD-22). The partition names are the ones `partition.js` exports as `PARTITIONS`. Once a candidate is promoted to a draft mutation, the native probe that carries it is partitioned natively like any authored probe.

## Accepted risk

A candidate's identity is a digest over its full content: a domain tag with the schema version, candidate and campaign IDs, partition, generator name, version and seed, intent, hypothesis, requirement path and digest, target path and digest, and the edit's `find`, `replace` and `occurrences`. Each part is length-prefixed by `digest.js`, so moving text between neighbouring fields cannot reproduce an identity. A short signature of an operator and a description cannot serve as an identity.

A review and an accepted risk each bind to a scope: the identity, a determination digest over the disposition and the independent evidence, and the observations (ID and a digest of the whole observation: arm, evidence and trial counts) the decision rested on. The reader refuses a decision once the identity or determination differs or a reviewed observation is missing or changed. A confirmed review has to cite a completed baseline observation and a completed candidate observation, so the evidence a verdict rests on cannot be swapped after the review. Observations appended after a decision leave it valid, so a repair re-run adds evidence without disturbing the original miss, and the miss cannot be removed while a decision cites it. Because the identity covers the requirement digest, changing the digest recorded in the candidate invalidates the decision, and `readCandidate` also holds the requirements file on disk to that digest.

An accepted risk needs a reviewer, a date, a rationale and a revisit condition, and applies only to `confirmed-undesirable-missed`. It leaves `disposition` and `observations` untouched, so a waived candidate stays in every count that includes it. The record holds the current decision and the folder's history holds the earlier ones.

A reader in the same file as its digests cannot detect a forger who rewrites every field and digest consistently. The guards defend against stale and accidental edits, and the committed history shows the rest.

## What fails if this is reverted

| Claim                                                                                                                            | What fails                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fixture round-trips byte for byte, at every key depth                                                                          | `checkRoundTrip`                                                                                                                                                              |
| Every state and disposition is representable without a native verdict                                                            | `checkEveryStateAndDispositionRepresentable`, `checkEngineSchemasRefuseTheCandidate`                                                                                          |
| The lifecycle only moves forward, evidence is independent, decisions go stale                                                    | `checkRefusals`                                                                                                                                                               |
| A file is read from its own path, through no link, against the requirements, evidence snapshots and qualification chain it names | `checkFileReading`, `checkQualificationChain`, `checkRealQualificationEvidence`, `checkEvidenceProvenance`                                                                    |
| A candidate cannot enter a scored artifact                                                                                       | `checkBoundaryThroughTheRealLoader` plants the fixture's own bytes in every directory and in `evaluation.json` and runs `checkEvaluation` and the `tea-evaluate check` binary |
| Promotion yields an ordinary mutation                                                                                            | `checkPromotionYieldsAnOrdinaryMutation`                                                                                                                                      |
| Native code and candidate code stay apart                                                                                        | `discovery-import` in `test/test-evaluate-boundaries.js`, with seeded violations                                                                                              |
| Candidate fields stay out of native schemas                                                                                      | `checkNativeArtifactsAreUnchanged`                                                                                                                                            |

## Pinned versions and sources

Written against:

- TeA 3.0.2, commit `6c2584d8a1016f971204bcd463adc1d487fb1af4` (the v3.0.2 release commit). The v3.0.0 release commit is `988415514a7f9f82fb0eaa69e9e88e7359b2dd71`.
- eval-quality 8.0.0 as installed, from `package-lock.json`: `https://registry.npmjs.org/eval-quality/-/eval-quality-8.0.0.tgz`, integrity `sha512-phSqhR5/ylbiypPww9CsVpXbNU5MeEOLD3a94bNxXPX4XLKiphfDQ9EsiDyLSGjchmRwsa2nJt50JmpplgXUVg==`. `package.json` declares `eval-quality` as `latest` in dev dependencies and `>=8.0.0` as an optional peer.
- Node 24.22.0 for the recorded hashes. The package requires Node 22.20.0 or later.

SHA-256 of the TeA sources inspected, taken from the pinned commit:

| File                                                       | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `cli/lib/evaluate/run.js`                                  | `254fe7ccd54066eb6551f7bbb4e07026575d6e070e6a9ffc9cd361827225ecab` |
| `cli/lib/evaluate/records.js`                              | `06875e1f54b1d44a87661daae390b2d6865741e217e3f388e0f65a6f4dd11713` |
| `cli/lib/evaluate/score.js`                                | `4f4985ba28a4c0ecb4e22257d3f7f8df9889b8c329973525b9df22ccca426b46` |
| `cli/lib/evaluate/score-inputs.js`                         | `c3166fa1561f5a6efecd953ad4f538ab457acde24d4185fe193ae87a29c38e00` |
| `cli/lib/evaluate/evaluators.js`                           | `9afc95e09d564ce7053ea7a37c56330793e539b2790a0d592a1aa65a70fe00e4` |
| `cli/lib/evaluate/partition.js`                            | `245bfbd7113b9a33020d2a3c93c372e2ab7095e15362e5877c35448bf1538158` |
| `cli/lib/evaluate/workspace.js`                            | `198f6220c1985a5ddbe5aa37ab117f35de325d84eb204df9da869ed626835094` |
| `cli/lib/evaluate/confinement.js`                          | `c3146dd509c225921ad28b7715bb3931f2f7f9f1a287468d4132e7c7ed409a8c` |
| `cli/lib/evaluate/usage-report.js`                         | `45a4890bccbf5a9c615491038cc906045be0bc6df4e52de7c78f64be951e3e24` |
| `cli/lib/evaluate/compare.js`                              | `b8a04c9908fd622137008334e7de0f7ec5b7ccbbce1c05557dd2dfce61ccdf8f` |
| `cli/lib/evaluate/calibration.js`                          | `a8dcc51ffda63fecc022d191a7c6335ebf49dfaf8627393059b549b1bade46e3` |
| `cli/lib/evaluate/mutation.js`                             | `cfe06a47087f4210a7223b08f3cf4658e4f5cf1473bd041c3425f8c61e3d4da8` |
| `cli/lib/evaluate/check.js`                                | `e92f12101297ee837ca5601840db68aad8c4f82240148a038f234110583663dc` |
| `cli/lib/evaluate/preflight.js`                            | `b770bdcc88533ed6cb27eeb874f47d9a7d1ebd1d9d2e785a5315b39ee2a95955` |
| `cli/lib/evaluate/digest.js`                               | `0745da98701da2069c5018658aac972c19d794db26898164621388ecf7278d51` |
| `cli/lib/evaluate/schemas/evaluation.schema.json`          | `1c0a5a9bcd17c20d5bac2f959212cd53eb7ffc32d6e8a52f62068edc63535d47` |
| `cli/lib/evaluate/schemas/mutation.schema.json`            | `425926b69ffa2209381f3e4de5df660eba1a1d35fb2ceab011381fb8a81c5968` |
| `cli/lib/evaluate/schemas/committed-probe.schema.json`     | `872350bcae0968ffd2568caf89b246cdc578cef337ab71e8e3eaf4a57bc9ba3e` |
| `skills/bmad-tea-evaluate/references/authoring-routing.md` | `b49dea459c8a903038dbddb39256347ac251c35a7ee36d40d83e2d781a5609f9` |
| `skills/bmad-tea-evaluate/references/mutation.md`          | `35f21b91e8d217ad6042758f634fec225a6a729e3870f029ac2f1f0edca17234` |
| `skills/bmad-tea-evaluate/references/gaps.md`              | `ab01ca6c0edfd2c6842fb066a92ba0a993634f5b3ce533b34b31345f58d19053` |

SHA-256 of the installed eval-quality files inspected:

| File                                                    | SHA-256                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `eval-quality/schemas/probe.schema.json`                | `696adb73df3cc7e85c828dc85a2015798cb64943186bd0ce396319ede8cd8e44` |
| `eval-quality/schemas/scoring-policy.schema.json`       | `168e06e04e3d4f8f21833b7f65fb6d751369956224553d5a9233cc819c30ed6f` |
| `eval-quality/schemas/sealed-run-record.schema.json`    | `37331c407af7ab88d30b7c9304a215f592e6d25094d6192bd4862187a2c715fc` |
| `eval-quality/schemas/evidence-artifact.schema.json`    | `4ab015f02ee7c4d7c094a54712f3c37c4f7058bb62abb823843f2e2f05323d2d` |
| `eval-quality/schemas/artifact-reference.schema.json`   | `97a1c495feee705235002c84abda90b1331108e8b90683a83da44976a27afa62` |
| `eval-quality/schemas/strength-aggregate.schema.json`   | `81a8689735367740364f0a088c111227b6d0ecbe2efcfd67f78e28c9e4b7748c` |
| `eval-quality/dist/core/score/qualification.js`         | `773a6a2460f3d6b24e440de844352c3ec6f498fde916ccfe41fa66042da53b68` |
| `eval-quality/dist/core/schemas/probe-qualification.js` | `e4718db1785b8ba4f533ee2205b14f2a2d230c0479de799bf4c1c79de7060f48` |
