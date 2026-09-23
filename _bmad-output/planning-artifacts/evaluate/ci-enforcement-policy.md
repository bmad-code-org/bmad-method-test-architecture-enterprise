# CI enforcement policy shape

What CAP-11 (CI enforcement wiring) and CAP-12 (evidence publishing) have to decide for an adopter, and the precedent TeA's own repository already sets for it. Architecture (step 2) decides the mechanics; this companion is the shape those decisions fill in.

## The three CI tiers TeA already proposed

`docs/explanation/eval-quality-roadmap.md` section 5 names three tiers, unimplemented as a general pattern before Evaluate: **Deterministic** (every pull request; no credentials; compile, data validation, scorer replay), **Smoke** (manual and scheduled; one qualified case per suite; bounded model use), **Full matrix** (manual, scheduled, and release candidate; every suite at its required repetition count). CAP-11 wires an adopter's CI to this shape.

## The CI evaluation set

Per behavior an adopter declares, the checks that can run in CI, roughly ordered from cheapest to most expensive:

1. **BEC compile validation:** `eval-quality compile`, no model call, no network. Belongs on every PR.
2. **Contract-source freshness:** when the contract is generated from ground truth (fixtures, step files, runner request shapes), a regeneration check that fails when committed bytes drift from what the generator would produce. TeA's `tools/generate-contracts.js --check` is the precedent.
3. **Oracle-vs-scorer agreement:** evaluate every oracle against stored evidence and compare with the harness's own scoring logic, with no model call. TeA's `test:contract-oracles` is the precedent; it found that eleven of thirteen `test-review` oracles could never resolve, while the contract compiled clean the whole time.
4. **Execution-target registry check:** every interface, executable, and subcommand path a contract declares must be one the registry carries, and every registered command must be named by some contract, in both directions. TeA's `test:probe-targets` is the precedent; it closes the gap where eight contracts declared a runner that did not exist and the gate stayed green over it.
5. **Preflight:** clean controls, seeded-fault-fired, seeded-faults-scoped, input sensitivity. Costs a real (or stubbed) run against the target. TeA runs this by hand as `eval:preflight`, outside the default PR gate, because it spends real legs (model time when the target is a live agent).
6. **Scoring a twin run, at the declared repetition count:** clean arm and mutated arm, both `contract-scoring` mode, repeated the number of times the scoring policy's minimum trial count declares. A set short of that minimum remains valid input and produces a strength vector marked non-comparable, so the CI wiring enforces the trial count as well as the verdict. This is the expensive tier: live model calls when the target is agent-shaped.
7. **Replay against stored evidence:** score fixed, previously captured observations with no model call, to catch a scorer or parser regression without spending a live run. TeA's `test:eval-replay` (108 stored cases) is the precedent.
8. **Contract-strength threshold and comparison:** a declared minimum catch rate per probe class the adopter treats as a bar (the threshold), checked on its own and via `compareDominance` between a new scored result and a recorded baseline, gated on matching `comparabilityKey` and `comparable: true` on both sides. TeA's own suite manifest is the precedent for declaring a threshold before the live run.
9. **Repository-governance gates, where the adopter opts in:** `eval-quality-gates`, configured through `eval-quality.config.json`, for deterministic policies orthogonal to behavioral evaluation (dependency licences, lockfile freshness, package boundaries, doc-claim drift). Generating or updating that config file, and wiring whichever gates the adopter adopts into the same CI run, is part of CI wiring when the adopter wants it; see `eval-quality-vocabulary.md` for why gates never substitute for the behavioral checks above. TeA, the first adopter, already has all eight gates configured and wired into its own CI today; how CAP-11's new checks relate to that existing job is an open question in `SPEC.md`.

## Enforcement classes

Every check needs a declared answer to "what does this check do when it fails":

- **Blocks the pipeline.** Fails the PR or merge outright. Reserved for checks that cost nothing (no model call) and catch a structural defect: compile failures, registry mismatches, stale generated contracts, replay regressions.
- **Surfaces as CONCERNS.** Visible, tracked, and non-blocking by itself. `eval-quality`'s own verdict ladder distinguishes CONCERNS from FAIL for exactly this reason: a contract can catch its planted defect and still report CONCERNS on an unrelated coverage gap or trial-count shortfall. TeA's own precedent (`docs/explanation/eval-quality-adoption-guide.md`, "The one promotion TEA declines") is to never use `--strict` to promote CONCERNS to a blocking exit; CONCERNS is read until the underlying coverage gaps are deliberately closed.
- **Informational.** Recorded and published, gating nothing: contract-strength trend, timing, cost. TeA's `test/results/eval-all/latest.json` history is this tier.

## Failure classification, told apart before a number is reported

Four classes an enforcement policy keeps separate, so a failed model call never reads as a measured quality regression:

- **Target-behavior failure:** the system under test did the wrong thing. A `defect` probe resolving `missed` or an oracle resolving `false` means this.
- **Evaluation weakness:** the contract itself is thin: an unsatisfied coverage rule, an abstained oracle, a trial count below the declared minimum. This is `CONCERNS` territory, a finding about the eval itself.
- **Repository-policy violation:** a deterministic, non-behavioral check failed: a stale generated contract, a licence violation, a dependency-direction breach. This is `eval-quality-gates` territory when the adopter has opted into gates, or an ordinary repo lint otherwise; it stays out of the behavioral verdict.
- **Infrastructure or invocation failure:** the harness could not complete measurement: missing credentials, timeout, transport error, unparseable output. TeA's own rule, stated directly in the adoption guide, is worth inheriting verbatim: **a failed model call is an environment failure and never a low score.** TeA's three-exit-class convention (`0` pass, `1` measured quality failure, `2` environment failure, ordered so environment failures always outrank a measured one) is the worked precedent; whether Evaluate imposes this exact scheme on every adopter or documents it as a pattern is an open question for architecture.

`eval-quality-facts.md` maps these four classes onto `eval-quality`'s own outcome states, ladder rows, and exit codes; CI policy builds on that existing vocabulary.

## Evidence to publish

For a completed CI run to be auditable without re-running it: the evidence artifact itself (outcomes, verdict, verdict basis, strength vector, coverage gaps), the preflight verdict, the sealed run records or a pointer to where they are archived, run metadata (contract digest, corpus digest, model/runner identity when applicable, repetition count, duration), findings from whichever repository-governance gates the adopter adopted, and a diffable comparison against the last recorded baseline. TeA's `test/results/eval-all/latest.json` plus timestamped history, and its use of `compareDominance` to compare stored results by strength, is the existing worked pattern for the last two.

## Decisions left to architecture

Whether Evaluate generates a dedicated CI job per adopter, extends `bmad-testarch-ci`'s existing pipeline-generation step, or does both. Which of the nine checks above are mandatory or optional per adopter. Whether the three-tier trigger model becomes Evaluate's default shape for every adopter or stays a TeA-specific convention Evaluate documents.
