# nfr-eval fixtures

Fixture corpus for the `bmad-testarch-nfr` behavioral eval. Two independent evidence bundles, each a small slice of a fictional platform.

```text
gapped/   a billing ledger whose security evidence is complete, whose reliability
          evidence breaches a stated threshold, whose performance has no threshold
          to be judged against, and whose stated coverage threshold has no report
clean/    a notification relay whose every threshold is stated and met
```

Each bundle is a separate service with its own thresholds. Audit one bundle per run. Judging one service's measurement against another service's target is the mistake the two-workspace design exists to prevent, and the expected answers in `ground-truth.json` are stated per bundle.

## What this corpus is for

The manifest carried `bmad-testarch-nfr` under `deferred` with one sentence of missing evidence: no fixture with known gaps existed, so an unsupported PASS could not be told from a grounded one. These two bundles are that fixture.

The gapped bundle tempts an unsupported PASS twice, and both temptations look like thorough evidence:

- **Performance** carries a real load-test report with a healthy p95 and no threshold anywhere in the bundle to judge it against. A run that supplies its own target has guessed, which the workflow's own checklist forbids.
- **Maintainability** carries a tech-spec sentence asserting the ledger is well covered, and no coverage report at all. A run that reads a prose claim as evidence has passed on an assertion.

The clean bundle is not optional. A suite that only rewarded refusing PASS would be cleared by a workflow that never passes anything, so the control carries four supportable PASS results and any finding against it is a false positive.

## Rules for anyone editing this directory

- Do not repair, extend, rename, or reformat a fixture file. The harness measures an NFR run against these exact files, so an edit silently moves the benchmark. That applies to both bundles, whatever a file appears to need.
- `ground-truth.json` is authored from the fixture design and from the workflow's own rules, never from a run's output. If a bundle changes, re-derive every expected status by reading the files and the rule the status rests on.
- Every declared evidence file must be on disk and every file on disk must be declared. `--validate-only` holds `evidenceFiles` equal to the directory in both directions, because an undeclared file is an input the ground truth says nothing about and a declared one that is absent is a citation target that resolves to nothing.
- Do not put `ground-truth.json` into the context handed to the agent under evaluation.
- No fixture file states what its own evidence establishes or fails to establish, and no file calls itself a gap. The measurement is whether a run reads the evidence and the thresholds, and a note in the file would hand it the answer. Keep any new commentary neutral.
- No credential value belongs in a fixture. The two logging configurations say where a DSN comes from rather than carrying one.

## Every expected status names the rule that produces it

`domains.<name>.rule` on each bundle names an entry in `skillRuleCitations`, and that entry names the file and the section the rule is stated in. `--validate-only` fails when a cited file is gone or no longer carries the section, and prints a drift notice when the line span has moved inside it. A status whose rule cannot be found is an opinion, and an opinion cannot be a benchmark.

Two of those rules make a domain **undecidable**, which is the property the unsupported-PASS ceiling is defined over:

- `undefinedThresholdIsConcerns` (`nfr-status-definitions.md`): a finding whose threshold was UNKNOWN at Step 2 must be CONCERNS, never PASS.
- `missingEvidenceIsConcerns` (`step-03-gather-evidence.md`): if evidence is missing for a category, mark that category CONCERNS.

Both name CONCERNS in as many words, which is why the corpus demands that exact status rather than merely demanding "not PASS". `isUndecidable` and the rule are held equal in both directions, so a domain cannot be flagged undecidable under a rule that does not make it so.

## What `ground-truth.json` declares, and what reads it

Every top-level key is read by `test/eval-nfr.js`. `fixtureSets` is the corpus itself. `domains` is the four domains Step 4 dispatches a worker for, checked against the harness's own list. `skillRuleCitations` is checked against the files it cites. `negativeControls` names five things a run must not do, and each id has a row in the harness's `NEGATIVE_CONTROL_ENFORCEMENT` table naming the threshold that catches it; a control with no row fails `--validate-only`. `rejectedCases` names two cases the corpus deliberately leaves out, and each id has a predicate in `REJECTED_CASE_EXCLUSIONS` that every bundle is held to. `criteria` under each domain is recomputed into the domain status and compared, the way trace's `coverageArithmetic` is; the harness scores the rollup and the typed status exists so a mistake here is caught rather than propagated. `mustNotReport` on each bundle is documentation for whoever adjudicates a false positive later.

## What the harness scores deterministically

Each of these is a function of a run's report and the corpus:

- A `## <Domain> Assessment` section exists for each of the four domains.
- A domain's status is the worst status inside its section, and it equals the expected one.
- Neither undecidable domain is reported PASS.
- A stated threshold is named in the domain's threshold lines, and a threshold no source states is recorded as `UNKNOWN`.
- The Gate YAML's `overall_status` is what the four domain statuses roll up to.
- Every file-shaped evidence citation resolves to a file the bundle carries.
- Nothing is reported against the clean bundle: no domain below PASS, no evidence gap, no threshold recorded as unknown.
- The bundle is byte-identical before and after the run.

## Where the deliverable falls short of a contract

The workflow's Gate YAML snippet carries `overall_status` and the eight ADR checklist categories. It carries no per-domain block for the four domains Step 4 evaluates, so the four domain statuses have to be read out of the markdown sections rather than off a machine-readable field. Inventing a JSON artifact for the eval's convenience would score a contract the workflow does not declare, so the gap is recorded here rather than papered over.
