# Probe Corpora

A contract says what a TEA skill has to do. A probe says what was wrong with the system when the
contract was asked, and `eval-quality`'s `runScore` reads the two together to answer the question the
package exists for: did this contract's oracles catch the defect that was actually there?

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

**Every probe here is generated. Do not hand-edit one.** `tools/generate-probes.js` writes all fifteen
files from the sources this repository already keeps: `test/fixtures/test-review-eval/ground-truth.json`
and `criteria-registry.md` for the planted rows and their severities,
`test/fixtures/trace-eval/ground-truth.json` for the seeded set's coverage gaps,
`test/fixtures/nfr-eval/ground-truth.json` for the domains one evidence bundle leaves undecidable or
breached, `test/fixtures/ci-eval/ground-truth.json` for the elements one project's request states and
forbids, `test/fixtures/test-design-eval/ground-truth.json` for the risks each epic supports and the
risks it rules out, each `test/evals/<workflow>/evals.json` for the required and forbidden fragment sets, and
`test/fixtures/tea-routing-eval/ground-truth.json` for the routing answers. Regenerate with
`node tools/generate-probes.js`; `npm run test:probe-sources` fails when a file on disk differs from
what its sources generate.

Each probe names the oracle that catches it, through the behavior it declares. `eval-quality`'s
`designatedOracleIdOf` resolves AD-40's designated oracle only for a behavior declaring exactly one
oracle, so `behaviorId` is read out of the generated contract rather than chosen, and the generator
refuses a probe whose behavior discharges more than one. A probe that restates a plant nobody can
detect is worthless, and that check is what keeps one out.

## The mutations are qualified in a disposable copy

A controlled-mutation probe carries `rollbackVerified: true`, and for the five corpora that have one the generator earns it.
Each of the 32 probes is run through `runMutationCycle` over a temporary workspace: the clean arm scores a copy of a stored
reference artifact, the one exact edit that yields the stored mutated artifact is applied, the mutated arm scores it, the original
bytes are restored and their digest compared, and the clean arm scores again.
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

The direction of the cycle's witness differs between the corpora.
For the test-review, trace and nfr probes the plant is in the system's input, so the manifestation witness fires on the correct run the clean arm scores and is silent on the mutated artifact, which models a run that misses the plant.
Pre-flight needs that: its fault leg replays the correct run on the planted input, and the witness has to fire there and stay silent on the clean legs.
The three ci probes read the other way round by the witness's wording alone: it reads the element the run gets wrong (the weekly schedule and the `contents: read` grant a run misses, the burn-in job a run adds), so it fires on the mutated pipeline and is silent on the correct one.
Their plant is the request in the project's docs, as for the other fifteen, so their fault leg replays the correct run and finds the witness silent.
That is why the pre-flight of all three records `failed: seeded-fault-fired, seeded-faults-scoped` in `expected-strength.json`, which it did before the cycle moved their mutation.
Fixing the witnesses moves those outcomes, so it is filed as Story 1.121 and not done with the mutation cycle.
The qualification suites resolve each committed probe's witness over both stored artifacts and hold each corpus to its direction.
`npm run test:test-design-qualification`, `test:test-review-qualification`, `test:trace-qualification`, `test:nfr-qualification` and `test:ci-qualification` plant each failing step.

## The routing corpora carry no defect probe

`tea-routing-intents.probes.json` and `tea-routing-controls.probes.json` ship a gameability probe and
a clean control each, and nothing else. A defect probe needs a controlled mutation of the system under
test with baseline and mutated evidence, and the system here is `src/agents/bmad-tea/SKILL.md`.
Mutating the skill to prove that the eval catches the mutation is an edit to the thing being measured,
so the route is closed rather than unused. The fragment-selection corpora carry the same two classes
for the same reason.

The gameability probe is worth reading, because it is about the scoring the routing suite chose.
A stated reason is scored by token containment, which is cheap and deterministic and gameable: a reply
that quotes the user's own message back as its reason satisfies every deciding token the fixture
names, whatever it then did with the message. That reply is the probe. The oracle that catches it is
the one reading the decision rather than the prose: the menu code for the intents contract, and the
question for the controls contract, where a clarification that names nothing to choose between passes
the reason oracle and asks the user nothing.

## Running them

```bash
npm run test:probe-sources        # are the corpora what their sources generate?
npm run test:probe-corpus         # does every probe score, and does every artifact validate?
npm run eval:preflight            # the live pre-flight, cached, no scoring
npm run eval:contract-strength    # the live pre-flight, then score and seal
```

`npm run test:probe-corpus` is in `npm test`. It runs the whole chain (`runPreflight`, `runScore`,
`seal`) against the outputs `test/replay/` already stores, answered through a port that reads them
off disk, so it needs no credential and makes no paid call. A trace leg is answered with the fixture
set its own prompt names and an nfr leg with the evidence bundle its own prompt names, which is the
same rule the live adapter stages by.
`test/probes/expected-strength.json` records what every probe scores, and any movement in either
direction fails the check until somebody has read why and regenerated it with
`node test/test-probe-corpus.js --write`.

The two live scripts run the same code against the real command-line adapter. Every observation is
cached under a digest of the request that produced it, so a rate limit costs one leg and not the set,
and the cache also collapses the legs that are the same request: AD-10 mints two control-observe legs
from the first witness leg's inputs, so eight planned legs cost two runs.

## What each class establishes

- **`defect`**: a planted registry row, a withheld coverage gap, a test design document that omits a
  risk the epic supports or reports one it rules out, or a domain whose threshold or whose evidence an
  audited bundle does not carry. It is a controlled mutation whose target artifact, baseline-pass
  evidence and mutated-fail evidence are all files this repository keeps, and its signature states the
  observable the plant produces.
- **`zero-action` with `expectedClean`**: the clean control. AD-7 keeps it out of the strength vector
  on purpose; what it establishes is that the contract does not fire where there is nothing to find.
- **`gameability`**: the degenerate reply that clears a naive oracle and is rejected by a disciplined
  one. For fragment selection that is a selection naming every fragment in the index, which satisfies
  the containment oracle and violates the exclusion oracle. AD-9's gameability route qualifies a
  response rather than a seeded defect, so these probes declare no defect and owe no manifestation
  witness.

## What test-design's corpus does and does not establish

`bmad-testarch-test-design` declares one output and it is prose, so every oracle in that contract
reads the whole document.
`tools/generate-contracts.js` pairs each one with `documentMentions`, the harness's own
document-global predicate, and the probes are held to the same reading.
Each rationale therefore says what its oracle establishes rather than what the suite measures.
The row-scoped grounding, the arithmetic, the band placement, the coverage mapping and the priority
ordering are all `test/eval-test-design.js`'s, and no probe claims an oracle reaches them.

Two of those probes are worth reading for what they say about the contract's edges.
P-007 through P-015 seed a ruled-out risk, and the oracle that catches each one fires on any mention
of the risk's vocabulary anywhere in the body, including a paragraph explaining why the risk does not
apply.
P-016 is the gameability probe and it is the weakness this contract has no way to close: a document
with the reference run's mentions map and the generic register's grounding block satisfies all ten
oracles the contract states for the seeded set over the stdout projection while reporting nothing the epic supports.
Its defect signature is the conjunction of those ten checks, because nothing expressible over a
markdown body separates that document from a correct one.
What separates them is the row-scoped scorer, which matches each declared risk against one register
row in an admitted category.

The contract's `O-016` and `O-017` are the two `projection-coherence` oracles, one per fixture set, and no probe
is written for them. A defect probe needs a stored run whose document makes the oracle resolve false, and the
runner derives its projection from the document with one function, so no document makes the projection
incoherent. These oracles guard the runner against a projection it should never emit, which
`test/test-contract-oracles.js` proves with planted projections, and they hold the contract's `whole-body`
coverage. `O-016` and `O-017` also read the design artifact beside stdout, which a defect signature cannot address, so they are outside P-016's conjunction. `tools/generate-probes.js` checks them against the corpus and fails when the contract states any
other oracle past the per-set ones.

This corpus is generated, byte-checked and scored by the deterministic gate.
`testDesignEvidence` in `test/lib/probe-scoring.js` answers each leg from the documents stored under
`test/replay/test-design/`, which every probe cites, and `npm run test:probe-corpus` records the sixteen
probes in `expected-strength.json`.

## What a stored run's dispositions say

The trace, nfr, test-design and ci records score a stored run as the correct run of its set or project.
Each oracle's disposition comes from the scorer `tools/generate-contracts.js` pairs with it (the harness's `scoreRun` for trace, nfr and test-design, `workflowMentions` for ci), applied to the stored run the record carries for that oracle's own set.
The test-review record measures its stored verdict: the registry-row and scope oracles from what the harness measured, the verdict-payload oracle from the fields the verdict carries, and the exit-code oracle from the exit code its recommendation maps to.
The fragment selection and routing records read no stored run; they construct the answer they score.
A record that carries no run of a set (a defect probe carries only the project it plants a defect on) leaves that set's oracles at `held`, since there is nothing to read.

`test:probe-corpus` fails with the oracle that no longer holds when a stored run is not the correct one.
It also holds every set and every oracle to a wrong run, so a disposition that stopped reading its run fails:

- each leg reads the next leg's run in turn, and a set must lose an oracle that holds on its own run;
- each leg reads every other stored case of its suite, one at a time, and every oracle must be violated by a scorer under at least one wrong read (the three ci `run-measured` oracles, whose scorer reads no workflow, are listed in `WRONG_RUN_CANNOT_FAIL` in `test/test-probe-corpus.js` with the reason; the two test-design projection-coherence oracles fail only through a projection with its `design` key dropped);
- trace, nfr and test-design read a run the harness refuses to score through every leg, which fails every oracle of the set (test-design's projection-coherence oracle reads the projection alone and stays as it measures; a projection with a key dropped is what fails it), and a violation a refusal produced counts only for the `run-measured` oracles, since the refusal answers every other oracle without calling its scorer;
- an evidence builder of those four suites that exposes no `storedRunSpecs` or `storedRunLegs` fails, so a builder reverted to a constant `held` cannot opt out of the checks above;
- a contract declaring an oracle the generator does not specify throws, for the four builders and for test-review's;
- test-review reads its verdict with one field dropped at a time and through a verdict the harness refuses to score.

The baseline records no oracle disposition, so it cannot say which oracle stopped holding, and it sees a wrong `CI_CORRECT_RUNS` row only where the row changes the run a defect probe carries.
The clean control P-004 passes pre-flight and scores `CONCERNS` with exit 0, and the per-probe summary the baseline keeps carries only `probeId`, `state`, `severity` and `trialIndex` of each outcome, so a moved disposition or corroboration never reaches `expected-strength.json`.
The full and minimal defect probes carry their project's run, so six of the 11 caught deviation rows (`full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped` and `minimal-template-copied`) and a row of the full project at the minimal project's run, or the reverse, move it anyway.
The other five caught rows (`evaluation-plan-plan-not-detected`, `evaluation-plan-upload-wrong-path`, `full-e2e-command-replaced`, `minimal-artifact-added` and `minimal-retry-action-added`) and any row of the evaluation-plan project, whose run only P-004 reads, leave it unchanged.
The oracle-level checks above are what see those.

The contract's vocabulary reaches a workflow as one string, so a deviation that only a structure shows leaves every oracle held.
Pointing a `CI_CORRECT_RUNS` row at a stored deviation fails `test:probe-corpus` for 11 of the 34 stored constructed ci deviations: `evaluation-plan-plan-not-detected`, `evaluation-plan-upload-wrong-path`, `full-e2e-command-replaced`, `full-not-a-workflow`, `full-permissions-missing`, `full-permissions-widened`, `full-trigger-schedule-missing`, `full-triggers-unscoped`, `minimal-artifact-added`, `minimal-retry-action-added` and `minimal-template-copied`.
The other 23 pass through, each read through the row of its own project: `evaluation-plan-bare-invocation`, `evaluation-plan-chained-commands`, `evaluation-plan-continue-on-error`, `evaluation-plan-evaluation-node-below-floor`, `evaluation-plan-job-continue-on-error`, `evaluation-plan-job-continue-on-error-expression`, `evaluation-plan-marker-dropped`, `evaluation-plan-one-step-per-check`, `evaluation-plan-root-install-in-job`, `evaluation-plan-step-continue-on-error-expression`, `evaluation-plan-upload-negated`, `evaluation-plan-upload-on-failure-only`, `evaluation-plan-upload-wrapped-condition`, `full-artifact-unconditional`, `full-burn-in-missing`, `full-injection-in-run`, `full-lint-needs-undefined`, `full-node-version-hardcoded`, `full-node-version-literal`, `full-node-version-step-output`, `full-test-step-suppressed`, `full-unparseable` and `full-workflow-dispatch-added`.
The oracle for the burn-in job (`burn-in`) is satisfied by the comment `# Weekly burn-in on Sundays`, which is why `full-burn-in-missing` passes through.
The harness's `checkElement` reads these structures, and Story 1.123 applies it to each `CI_CORRECT_RUNS` workflow.

Two ci oracles do not hold on the real capture of the evaluation-plan project: `command-evaluation-install` and `command-evaluation-ci-pr` search for the literal command, and the capture quotes the folder names for the shell.
The engine already resolves both to false with corroboration `disagrees` on the stored run (the disposition used to be `held` against a false check; it is `violated` with no defect finding now, which the engine's `disposition-contradicts-evidence` rule reads the same way), and no verdict moves.
`KNOWN_UNHELD` in `test/test-probe-corpus.js` lists exactly those two and fails when either one holds, so the list ends with the defect (Story 1.122).

## What the vocabulary cannot say

Recorded here because a silent omission would read as a passing measurement.

**A defect signature cannot address a file a command wrote.** `qualifyProbe` refuses an `artifact`
pointer as `condition-artifact-channel-contract-local`, because an artifact identifier is minted per
contract and a signature carrying one resolves only against the contract it was authored on. A
`stdout` pointer resolves only where the operation declares standard output as its descriptor
channel. `tea-fragment-selection-runner` does, so its signatures qualify and its gameability probes
score. `tea-test-review`, `tea-trace-runner`, `tea-nfr-runner` and `tea-ci-runner` all write their
deliverable to a file, so a signature that says something true about their plants is refused, and the refusal is
recorded in `expected-strength.json` rather than replaced by an `exit-code` signature that would
qualify and discriminate nothing.

The refusal is now measured per channel rather than asserted. Scoring `trace`'s three defect probes
through `runScore` with each channel in turn, over the same stored evidence: the committed `artifact`
signature is refused as `condition-artifact-channel-contract-local`, a `stdout` signature over the
same field is refused as `condition-pointer-unwritable` because the operation's descriptor channel is
the summary artifact, and an `exit-code` signature is admitted. The admitted one is the one that says
nothing: `cli/lib/runner-exit-codes.js` gives 0 to every run whose agent completed, so a trace run
that wrote a summary full of gaps and the clean control both exit 0 and the condition is true on
both. `tea-test-review` is the case where the exit code does discriminate, and its nine plant probes
carry it. `tea-trace-runner` has no such channel, so its three probes keep the signature that states
the truth about the plant and stay refused, with the reason code recorded per probe. `tea-nfr-runner`
is the same command shape and its three plant probes are refused the same way, on the same code and
for the same reason: every completed audit exits 0 whatever it wrote, so the one channel that would
qualify would separate nothing. `tea-ci-runner`'s three plant probes are refused for the same reason
again: a scaffold that wrote an incomplete or over-generous pipeline still exits 0, so no channel
besides the artifact one carries the truth, and it is the one AD-9 refuses. Unlike `tea-nfr-runner`'s,
all three also fail pre-flight on `seeded-fault-fired` and exit 3 before a verdict exists at all: the
manifestation witness fires on a leg the contract calls clean, the same blocker `test-design` carries.

**A document-level oracle reaches a domain only through the rollup.** The nfr contract addresses one
markdown report, which is one string to this vocabulary, so its claims are about the document: the
four sections exist, the Gate YAML publishes the expected overall status, a threshold no source
states is recorded as `UNKNOWN`. Two of the three plants have an oracle that a run getting them wrong
would violate. The third does not: a run that passed maintainability on a prose claim still publishes
`FAIL`, because reliability breaches a threshold in the same bundle, and still records `UNKNOWN`,
because performance states no target. `tools/generate-probes.js` points that probe at the gate oracle
and says so, and the harness is where that domain's status is actually scored.

The ci contract reaches the same shape from the request side. Its oracles are one substring claim per
requested or forbidden element, so each of the three planted probes (a missing trigger, a missing
permission, the full-request template copied onto the minimal project) has an oracle of its own that a
run producing the plant would violate directly; nothing here needed the gate-oracle workaround nfr's
third plant does, because a missing element and a forbidden one are each their own claim rather than a
consequence of a rollup.

**A rejected probe now names its reason.** The qualification gate computes a closed list of twenty
reason codes. Through eval-quality 1.3.0 none of them reached the evidence artifact or any published
export, so a rejected probe surfaced only as `infrastructure-error` and an exit code of 3, and a
corpus author had nothing to act on. From 1.4.0 `runScore` returns `qualification` beside the
artifact and the ladder, and `expected-strength.json` records the codes per probe. The reason still
stays off the evidence artifact, which is deliberate: it is a fact about the probe rather than about
the run.

**A seeded fault is scoped only where a leg can ask for the set without it.** `trace`'s three defect
probes failed pre-flight on `seeded-faults-scoped` through eval-quality 1.4.0, and the reducer named
the leg: `D-001: the manifestation witness fires on clean leg "witness-gate-withheld"`. The witness
was right and the leg was not clean. AD-10 reads every other leg of an operation as a clean leg, the
only other legs `trace-fixture-set` had were its two sensitivity witness legs, and both traced the
seeded set, so the plant was in every one of them. The manifestation witness asserts a coverage
number the seeded workspace produces and `allow_gate` does not move, so it fired there truthfully.

The staged workspace was the run's real input and no request could name it, so no leg could ask for a
set without the plant. Each fixture set now declares its own `projectRoot` in
`test/fixtures/trace-eval/ground-truth.json`, `buildPrompt` writes the whole prompt against it, and
both the live adapter and the stored-evidence port stage the set the prompt names. The contract's two
witness legs trace the clean set, where P0 coverage is 100 and the manifestation relation asserting
50 resolves false, so the check is satisfied on evidence rather than on an authored relation. The
`allow_gate` differential is unchanged and holds on either set. The three probes moved from
`preflight: failed: seeded-faults-scoped` to `preflight: passed` in `expected-strength.json`; they
are still refused by the qualification gate, so they still score nothing.

The project roots carry the epic each set traces rather than the set's role. A run that read `clean`
in the directory it works in would have been told the answer, and `validateCorpus` fails a corpus
whose project root names a role.

## What the scoring half reports about the contracts

`runScore` computes AD-20's coverage gaps from the contract itself, and this is the first thing in
this repository to read them. `expected-strength.json` records them per suite under
`unsatisfiedCoverageRules`, and they are findings about the contracts rather than about the runs.
