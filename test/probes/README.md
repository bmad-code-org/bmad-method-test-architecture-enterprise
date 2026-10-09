# Probe Corpora

A probe records the defect or degenerate response an evaluation must detect.
`eval-quality`'s `runScore` scores it against the contract's designated oracle.

| Corpus                                      | Probes | What they are                                                              |
| ------------------------------------------- | -----: | -------------------------------------------------------------------------- |
| `test-review.probes.json`                   |     11 | Nine planted registry rows, one clean control, one gameability probe       |
| `test-design.probes.json`                   |     16 | Fourteen defective documents, one clean control, one gameability probe     |
| `trace.probes.json`                         |      4 | Three seeded coverage gaps, one clean control                              |
| `nfr.probes.json`                           |      4 | Three planted domains, one clean control                                   |
| `ci.probes.json`                            |      4 | Two requested-element gaps, one forbidden-element plant, one clean control |
| `fragment-selection/<workflow>.probes.json` |    2x8 | One gameability probe and one clean control per workflow                   |
| `tea-routing-intents.probes.json`           |      2 | One gameability probe and one clean control                                |
| `tea-routing-controls.probes.json`          |      2 | One gameability probe and one clean control                                |

**Every probe here is generated.
Do not hand-edit one.** `tools/generate-probes.js` writes all fifteen files from the sources this repository already keeps: `test/fixtures/test-review-eval/ground-truth.json` and `criteria-registry.md` for the planted rows and their severities, `test/fixtures/trace-eval/ground-truth.json` for the seeded set's coverage gaps, `test/fixtures/nfr-eval/ground-truth.json` for the domains one evidence bundle leaves undecidable or breached, `test/fixtures/ci-eval/ground-truth.json` for the elements one project's request states and forbids, `test/fixtures/test-design-eval/ground-truth.json` for the risks each epic supports and the risks it rules out, each `test/evals/<workflow>/evals.json` for the required and forbidden fragment sets, and `test/fixtures/tea-routing-eval/ground-truth.json` for the routing answers.
Regenerate with `node tools/generate-probes.js`; `npm run test:probe-sources` fails when a file on disk differs from what its sources generate.

Each probe names the oracle that catches it, through the behavior it declares.
`eval-quality`'s `designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior declaring exactly one oracle, so `behaviorId` is read from the generated contract, and the generator refuses a probe whose behavior discharges more than one.
This binds each probe to one scoring decision.

## The mutations are qualified in a disposable copy

A controlled-mutation probe carries `rollbackVerified: true`, and for the five corpora that have one the generator earns it.
Each of the 32 probes is run through `runMutationCycle` over a temporary workspace: the clean arm scores a copy of a stored reference artifact, the one exact edit that yields the stored mutated artifact is applied, the mutated arm scores it, the original bytes are restored and their digest compared, and the clean arm scores again.
The workspace sits under the runtime's private root, outside the checkout, and the end of the cycle removes it.
A killed generator leaves a pid-named parent that the next cycle reclaims.
A failed step stops the generator before it writes anything, and the probe's cited evidence must carry the digests of the bytes the cycle worked on.

Each corpus states its own mutation and its own arm:

| Corpus        | Reference artifact                               | Mutation                                                                                     | Arm                                                                                                         |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `test-design` | the stored reference design of its set           | the edit that yields a stored seeded design                                                  | the replay projection, read for the oracle's polarity                                                       |
| `test-review` | the stored review that reports every planted row | withhold one row's finding (`test/fixtures/probe-mutants/test-review/`)                      | the row's oracle, resolved by eval-quality                                                                  |
| `trace`       | the stored correct summary of the seeded set     | withhold one coverage gap from the priority breakdown (`test/fixtures/probe-mutants/trace/`) | the breakdown oracle (O-004) for AC-8 and AC-10, the gate oracle (O-001) for AC-2, resolved by eval-quality |
| `nfr`         | the stored correct audit of the gapped bundle    | withhold one domain's finding (`test/fixtures/probe-mutants/nfr/`)                           | the oracle that reads that part of the report                                                               |
| `ci`          | the stored correct pipeline of its project       | withhold a requested element or add the forbidden one (`test/fixtures/probe-mutants/ci/`)    | the containment oracle that reads the element                                                               |

The test-design arm's result must also equal the result the stored run records, so the evidence a probe cites is what the cycle performed.
The other four arms are the probe's own contract oracle, so the cycle measures the claim the strength vector later measures.
That reading is why some probes name an oracle other than the gate: withholding trace's AC-8 or AC-10 leaves the gate at FAIL, because AC-2 holds the P0 band at 50%, and withholding nfr's maintainability concern leaves the overall status at FAIL, because reliability breaches a threshold in the same bundle, so each of those is qualified against the oracle that does see its mutation.
Each twin under `test/fixtures/probe-mutants/` is its reference with the one named edit, and the suites assert it: they list the lines or JSON paths that differ and the oracles that flip between reference and twin, each from held to violated.
The derived operator may not span the whole reference.

The direction of the cycle's witness is the same for every corpus that has a controlled mutation.
The plant is in the system's input (a spec file, a seeded set, a gapped bundle, the request in a project's docs), so the manifestation witness fires on the correct run the clean arm scores and is silent on the mutated artifact, which models a run that misses the plant.
Pre-flight needs that: its fault leg replays the correct run on the planted input, and the witness has to fire there and stay silent on the clean legs.
The three ci witnesses read the request in the workflow the run wrote.
P-001 and P-002 are a containment of the requested element (`0 2 * * 0`, `contents: read`).
P-003 is the requested `npm test` with the forbidden `burn-in` job absent, in an `all`.
The `all` carries the positive containment because the alternate-platform leg writes no workflow, and a `not` over a containment of an absent artifact is true: the flipped containment of `burn-in` fires on that clean leg and fails `seeded-faults-scoped`.
A bare containment of `burn-in` is silent on the minimal project's correct run and fires on the full project's, so it fails `seeded-fault-fired` and `seeded-faults-scoped`.
The ci pre-flight of all four probes passes in `expected-strength.json`, and the verdict and exit code of every probe are as they were.
The qualification suites resolve each committed probe's witness over both stored artifacts and hold each corpus to `plant-reported`.
`test:ci-qualification` also resolves each ci witness over an absent workflow, and P-003's over the full project's correct pipeline, which pre-flight drops for P-001 and P-002 because their fault leg sends the `witness-github-actions` request; so those shapes are held without a leg cache.
The reads run over the probes the builder emits and over the committed probe file, which is the one pre-flight reads.
`npm run test:test-design-qualification`, `test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification` and `test:ci-qualification` plant each failing step.

## The routing corpora carry no defect probe

`tea-routing-intents.probes.json` and `tea-routing-controls.probes.json` ship a gameability probe and a clean control each, and nothing else.
A defect probe needs a controlled mutation of the system under test with baseline and mutated evidence, and the system here is `skills/bmad-tea/SKILL.md`.
Mutating the skill to prove that the eval catches the mutation edits the thing being measured. These corpora contain no controlled mutation of that skill.
The fragment-selection corpora carry the same two classes for the same reason.

The gameability probe is worth reading, because it is about the scoring the routing suite chose.
A stated reason is scored by token containment, which is cheap and deterministic and gameable: a reply that quotes the user's own message back as its reason satisfies every deciding token the fixture names, whatever it then did with the message.
That reply is the probe.
The oracle that catches it is the decision oracle: the menu code for the intents contract, and the question for the controls contract, where a clarification that names nothing to choose between passes the reason oracle and asks the user nothing.

## Running them

```bash
npm run test:probe-sources        # are the corpora what their sources generate?
npm run test:probe-corpus         # does every probe score, and does every artifact validate?
npm run eval:preflight            # the live pre-flight, cached, no scoring
npm run eval:contract-strength    # the live pre-flight, then score and seal
```

`npm run test:probe-corpus` is in `npm test`.
It runs the whole chain (`runPreflight`, `runScore`, `seal`) against the outputs `test/replay/` already stores, answered through a port that reads them off disk, so it needs no credential and makes no paid call.
A trace leg is answered with the fixture set its own prompt names and an nfr leg with the evidence bundle its own prompt names, which is the same rule the live adapter stages by.
`test/probes/expected-strength.json` records what every probe scores, and any movement in either direction fails the check until somebody has read why and regenerated it with `node test/test-probe-corpus.js --write`.

The two live scripts run the same code against the real command-line adapter.
Every observation is cached under a digest of the request that produced it, so completed legs can be reused after a rate limit, and the cache also collapses the legs that are the same request: AD-10 mints two control-observe legs from the first witness leg's inputs, so eight planned legs cost two runs.

## What each class establishes

- **`defect`**: a planted registry row, a withheld coverage gap, a test design document that omits a risk the epic supports or reports one it rules out, or a domain whose threshold or whose evidence an audited bundle does not carry.
  It is a controlled mutation whose target artifact, baseline-pass evidence and mutated-fail evidence are all files this repository keeps, and its signature states the observable the plant produces.
- **`zero-action` with `expectedClean`**: the clean control.
  AD-7 keeps it out of the strength vector on purpose; what it establishes is that the contract does not fire where there is nothing to find.
- **`gameability`**: the degenerate reply that clears a naive oracle and is rejected by a disciplined one.
  For fragment selection that is a selection naming every fragment in the index, which satisfies the containment oracle and violates the exclusion oracle.
  AD-9's gameability route qualifies a committed response, so these probes declare no defect and owe no manifestation witness.

## What test-design's corpus does and does not establish

The workflow writes one Markdown design.
The runner also emits a parsed JSON projection with the original document, risk-row count, scored risk descriptions, and scored risk count.

Material-risk oracles read deciding vocabulary across the document.
Unsupported-risk oracles read one scored register description at a time, guarded by the projected count.
Reference-table descriptions stay outside that scored register, though their words still contribute to document-level material vocabulary.
`test:contract-oracles` checks both readings against their paired predicates.

The harness separately scores grounding, scale, arithmetic, band placement, coverage mapping, and priority ordering.
A passing contract oracle establishes only the scope it declares.

P-007 through P-015 seed ruled-out-risk cases.
P-016 is a gameability probe: it preserves the reference mentions and a generic grounding block while reporting no supported epic risks.
The row-scoped harness detects what document-level vocabulary misses.

O-016 and O-017 check projection coherence, one per fixture set.
They guard the runner's derived output and whole-body coverage.
`test:contract-oracles` tests incoherent projections directly.
No stored document makes the runner's own projection incoherent, so these oracles have no controlled-mutation probe.
They also read the design artifact, a channel a defect signature cannot address.

The deterministic gate generates, byte-checks, and scores all sixteen probes.
`testDesignEvidence` reads their cited documents from `test/replay/test-design/`, and the outcomes live in `expected-strength.json`.

## What a stored run's dispositions say

The trace, nfr, test-design and ci records score a stored run as the correct run of its set or project.
Each oracle's disposition comes from the scorer `tools/generate-contracts.js` pairs with it (the harness's `scoreRun` for trace, nfr and test-design, `workflowHoldsToken` for ci: `workflowMentions` over a literal token, `workflowMatches` over an element's `contractPattern`), applied to the stored run the record carries for that oracle's own set.
For ci, `test:probe-corpus` also scores each stored workflow with `scoreRun` itself, as the second half of that reading.
The test-review record measures its stored verdict: the registry-row and scope oracles from what the harness measured, the verdict-payload oracle from the fields the verdict carries, and the exit-code oracle from the exit code its recommendation maps to.
The fragment selection and routing records read no stored run; they construct the answer they score, and the routing record applies the whole-body scorer to the answer it constructed.
A record that carries no run of a set (a defect probe carries only the project it plants a defect on) leaves that set's oracles at `held`, since there is nothing to read.

`test:probe-corpus` fails with the violated oracle when a stored run is not the correct one.
It also holds every set and every oracle to a wrong run, so a disposition that stopped reading its run fails:

- each leg reads the next leg's run in turn, and a set must lose an oracle that holds on its own run;
- each leg reads every other stored case of its suite, one at a time, and every oracle must be violated by a scorer under at least one wrong read (the three ci `run-measured` oracles, whose scorer reads no workflow, are listed in `WRONG_RUN_CANNOT_FAIL` in `test/test-probe-corpus.js` with the reason; the two test-design projection-coherence oracles fail only through a projection with its `design` key dropped);
- trace, nfr and test-design read a run the harness refuses to score through every leg, which fails every oracle of the set (trace's whole-summary oracle reads the summary object, and test-design's projection-coherence oracle reads the projection alone: it holds with the projection intact and is violated by a projection with its `design` key dropped), and a violation a refusal produced counts only for the `run-measured` oracles, since the refusal answers every other oracle without calling its scorer;
- an evidence builder of those four suites that exposes no `storedRunSpecs` or `storedRunLegs` fails, so a builder reverted to a constant `held` cannot opt out of the checks above;
- a contract declaring an oracle the generator does not specify throws, for the four builders and for test-review's;
- test-review reads its verdict with one field dropped at a time (each of the four top-level fields, and each of the four a finding carries on its first and on its last finding) and through a verdict the harness refuses to score;
- the whole-body oracles of Story 1.100 follow the same discipline.
  Trace reads its stored summary with each key of the contract's required declaration dropped in turn, from one set's case at a time, and that set's whole-summary oracle must be violated while the other set's stays held.
  The refusal rule above does not cover the whole-summary oracle: a run the harness refuses to score (a stale `schema_version`, a matrix with no section) still carries a summary object, the engine reads it, and the oracle holds or is violated by what that object is.
  `REFUSED_READS` lists it under `measuresStill` for both trace legs, holding it with the summary intact and violating it with a key dropped.
  The stored `seeded-rejected-evidence-omitted` read violates the seeded set's oracle and holds the clean set's.
  Test-review reads its stored verdict with each of the 23 required keys dropped, with an undeclared key added and with each typed key of another type, and the whole-verdict oracle must be violated by each.
  The routing records read no stored run and are not in `STORED_RUN_SUITES`: they derive each case's whole-body disposition from `routingAnswerIsWhole` over the constructed correct answer the record carries, and `routingWholeBodyProblems` reads every case in turn through an answer with a null reason, a missing reason or action, an action the skill does not allow and an undeclared key, requiring that case's oracle to be violated and every other case's held.
  A contract without the whole-body oracle of a case fails the same check.

The baseline records no oracle disposition, so it cannot say which oracle stopped holding, and it sees a wrong `CI_CORRECT_RUNS` row only where the row changes the run a defect probe carries.
The clean control P-004 passes pre-flight and scores `CONCERNS` with exit 0, and the per-probe summary the baseline keeps carries only `probeId`, `state`, `severity` and `trialIndex` of each outcome, so a moved disposition or corroboration never reaches `expected-strength.json`.
The full and minimal defect probes carry their project's run, so six of the 14 rows the oracles catch (`full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped` and `minimal-template-copied`) and a row of the full project at the minimal project's run, or the reverse, move it anyway.
The other eight (`evaluation-edit-job-id-kept`, `evaluation-plan-plan-not-detected`, `evaluation-plan-upload-wrong-path`, `evaluation-tiers-shared-artifact-name`, `full-burn-in-missing`, `full-e2e-command-replaced`, `minimal-artifact-added` and `minimal-retry-action-added`) and any row of the evaluation-plan, evaluation-tiers, evaluation-edit or evaluation-gate project, whose run only P-004 reads, leave it unchanged.
The oracle-level checks above and the structural check below are what see those.

The contract's vocabulary reaches a workflow as one string, so a deviation that only a structure shows leaves every oracle held.
`test:probe-corpus` therefore also scores each project's stored workflow with the harness's own `scoreRun` over that project's ground truth (`ciStructuralProblems`, Story 1.123).
A correct run parses, draws no actionlint finding, carries every requested element, carries nothing the request did not ask for and breaks no rule, and a row that does not read one fails with the element, the lint finding or the violated rule.
Pointing a `CI_CORRECT_RUNS` row at a stored constructed ci case fails `test:probe-corpus` for 45 of the 48.
Fourteen of the 45 also violate an oracle of the contract: `evaluation-edit-job-id-kept`, `evaluation-plan-plan-not-detected`, `evaluation-plan-upload-wrong-path`, `evaluation-tiers-shared-artifact-name`, `full-burn-in-missing`, `full-e2e-command-replaced`, `full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped`, `minimal-artifact-added`, `minimal-retry-action-added` and `minimal-template-copied`.
The other 31 fail structural checks alone, including preserved-job or checkpoint changes, wrong event guards, altered upload conditions, suppressed test failures, and added commands or triggers.
`ciStructuralProblems` and the stored CI corpus retain the exact case inventory.
The remaining three of the 48 are correct spellings: `evaluation-plan-upload-wrapped-condition` wraps the upload's condition as `${{ always() }}`, which means what `always()` means, `full-node-version-literal` writes a literal `node-version` equal to `.nvmrc`, and `full-node-version-step-output` reads the version from a step output as the shipped template does.
The harness scores each of the three as the correct run, so a row pointed at one is a correct row and passes.
`ciStructuralSelfProblems` hands the check another project's workflow, a workflow without its burn-in job, one that does not parse, one with an unrequested trigger, one that breaks a rule, one with an actionlint finding and nothing else wrong, an edit whose checkpoint was rewritten, a stored run that is absent and a project the ground truth lacks, each of which it must report, and the three spellings above, which it must not.
Until Story 1.123 the oracle for the burn-in job read the bare token `burn-in`, which the comment `# Weekly burn-in on Sundays` satisfied, so `full-burn-in-missing` passed through.
The oracle is now a `regex` over a mapping key or a `name:` line that carries the word, anchored over the whole expression, and a comment line, a trailing comment, a `run:` line, a run-block line that is no key and the value of another key leave it unsatisfied, and a run-block line that starts with a key carrying the word holds, as an `env` key does.
Its token is the job id the template writes, `burn-in:`, which the pattern must also match.
`test:contract-oracles` scores 232 forms of the burn-in job through eval-quality and through the scorer.

The real capture of the evaluation-plan project quotes its folder names for the shell (`npm install --prefix 'evals'`, `tea-evaluate ci --evaluation 'evals/grader' --tier pr`).
The oracles of `command-evaluation-install` and `command-evaluation-ci-pr` therefore state a `contractPattern` beside the `contractToken` in `test/fixtures/ci-eval/ground-truth.json`, rendered with the vocabulary's `regex` operator and tested by the paired scorer with `new RegExp(source)`.
Each pattern tolerates a balanced pair of single or double quotes around the folder, which a correct run may also write around the tier, and separates the words of the command by `\s+`, since a folded YAML scalar can break the line between them.
Each pins the folder and the tier: an unterminated or mismatched quote, a trailing character, `--tier nightly`, `--tier prod`, another folder, another prefix and an omitted command fail their oracle.
`test:contract-oracles` scores forty-one forms of the two commands through eval-quality and through the scorer, and every stored correct workflow satisfies every oracle of its set.
`KNOWN_UNHELD` in `test/test-probe-corpus.js` is empty, and `storedRunProblems` fails a listed oracle that holds, a check `test:probe-corpus` exercises on every run so the list can be refilled.

## What the vocabulary cannot say

Recorded here because a silent omission would read as a passing measurement.

**A defect signature cannot address a file a command wrote.** `qualifyProbe` refuses an `artifact` pointer as `condition-artifact-channel-contract-local`, because an artifact identifier is minted per contract and a signature carrying one resolves only against the contract it was authored on.
A `stdout` pointer resolves only where the operation declares standard output as its descriptor channel.
`tea-fragment-selection-runner` does, so its signatures qualify and its gameability probes score.
`tea-test-review`, `tea-trace-runner`, `tea-nfr-runner` and `tea-ci-runner` all write their deliverable to a file, so a signature that says something true about their plants is refused, and the refusal is recorded in `expected-strength.json` with its qualification reason.

Scoring `trace`'s three defect probes through `runScore` with each channel in turn over the same stored evidence gives these results: the committed `artifact` signature is refused as `condition-artifact-channel-contract-local`, a `stdout` signature over the same field is refused as `condition-pointer-unwritable` because the operation's descriptor channel is the summary artifact, and an `exit-code` signature is admitted.
The admitted one is the one that says nothing: `cli/lib/runner-exit-codes.js` gives 0 to every run whose agent completed, so a trace run that wrote a summary full of gaps and the clean control both exit 0 and the condition is true on both.
`tea-test-review` is the case where the exit code does discriminate, and its nine plant probes carry it.
`tea-trace-runner` has no such channel, so its three probes keep the signature that states the truth about the plant and stay refused, with the reason code recorded per probe.
`tea-nfr-runner` is the same command shape and its three plant probes are refused the same way, on the same code and for the same reason: every completed audit exits 0 whatever it wrote, so the one channel that would qualify would separate nothing.
`tea-ci-runner`'s three plant probes are refused for the same reason again: a scaffold that wrote an incomplete or over-generous pipeline still exits 0, so no channel besides the artifact one carries the truth, and it is the one AD-9 refuses.
Like `tea-nfr-runner`'s, all three clear pre-flight, because each manifestation witness reads the request in the workflow the run wrote and fires on the correct run its fault leg replays.

**A document-level oracle reaches a domain only through the rollup.** The nfr contract addresses one markdown report, which is one string to this vocabulary, so its claims are about the document: the four sections exist, the Gate YAML publishes the expected overall status, a threshold no source states is recorded as `UNKNOWN`.
Two of the three plants have an oracle that a run getting them wrong would violate.
The third does not: a run that passed maintainability on a prose claim still publishes `FAIL`, because reliability breaches a threshold in the same bundle, and still records `UNKNOWN`, because performance states no target.
`tools/generate-probes.js` points that probe at the gate oracle and says so, and the harness is where that domain's status is scored.

The ci contract reaches the same shape from the request side.
Its oracles are one substring claim per requested or forbidden element (two of the evaluation-plan project's are quote-tolerant regex claims and the full project's burn-in job is a regex that reads a mapping key or a name line outside a comment), so each of the three planted probes (a missing trigger, a missing permission, the full-request template copied onto the minimal project) has an oracle of its own that a run producing the plant would violate directly; nothing here needed the gate-oracle workaround nfr's third plant does, because a missing element and a forbidden one are each their own claim.

**A rejected probe now names its reason.** The qualification gate computes a closed list of twenty reason codes.
Through eval-quality 1.3.0 none of them reached the evidence artifact or any published export, so a rejected probe surfaced only as `infrastructure-error` and an exit code of 3, and a corpus author had nothing to act on.
From 1.4.0 `runScore` returns `qualification` beside the artifact and the ladder, and `expected-strength.json` records the codes per probe.
The reason still stays off the evidence artifact, which is deliberate: it describes probe qualification.

**A seeded fault is scoped only where a leg can ask for the set without it.** `trace`'s three defect probes failed pre-flight on `seeded-faults-scoped` through eval-quality 1.4.0, and the reducer named the leg: `D-001: the manifestation witness fires on clean leg "witness-gate-withheld"`.
The witness was right and the leg was not clean.
AD-10 reads every other leg of an operation as a clean leg, the only other legs `trace-fixture-set` had were its two sensitivity witness legs, and both traced the seeded set, so the plant was in every one of them.
The manifestation witness asserts a coverage number the seeded workspace produces and `allow_gate` does not move, so it fired there truthfully.

The staged workspace was the run's real input and no request could name it, so no leg could ask for a set without the plant.
Each fixture set now declares its own `projectRoot` in `test/fixtures/trace-eval/ground-truth.json`, `buildPrompt` writes the whole prompt against it, and both the live adapter and the stored-evidence port stage the set the prompt names.
The contract's two witness legs trace the clean set, where P0 coverage is 100 and the manifestation relation asserting 50 resolves false, so the witness resolves false on the clean evidence.
The `allow_gate` differential is unchanged and holds on either set.
The three probes moved from `preflight: failed: seeded-faults-scoped` to `preflight: passed` in `expected-strength.json`; they are still refused by the qualification gate, so they still score nothing.

Project roots name each set's epic.
A run that read `clean` in the directory it works in would have been told the answer, and `validateCorpus` fails a corpus whose project root names a role.

## What the scoring half reports about the contracts

`runScore` computes AD-20's coverage gaps from the contract itself, and this is the first thing in this repository to read them.
`expected-strength.json` records them per suite under `unsatisfiedCoverageRules`, and they describe contract coverage.
