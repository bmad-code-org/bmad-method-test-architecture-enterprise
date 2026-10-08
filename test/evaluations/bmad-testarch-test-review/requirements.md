# Requirements statement: bmad-testarch-test-review

## What must be proven

Run as `tea-test-review` on a pull request, the review gates only on what the pull request did, and its findings are calibrated to the evidence in the code.

- **B-001, critical.** A pull request that adds clean lines to a test file holding old defects passes the gate with zero gating findings, and its report names no finding on a line the pull request did not touch.
- **B-002, critical.** A defect the pull request introduces fails the gate (exit 1), with a gating finding located on the added line.
- **B-003, material.** A test function the pull request adds is classified as introduced, whether the review runs on the head commit or on the merge commit.
- **B-004, material.** New setup that makes an unchanged assertion ineffective is a gating finding located on the changed setup line.
- **B-005, material.** Two distinct defects under one registry row stay two findings, each with its own title and location.
- **B-006, material.** A parameter-driven branch that asserts the expected value on every path is not a High finding. An assertion chosen by control flow over the system's own output is High.
- **B-007, material.** A type-assignability test in a repository whose CI runs a type checker is not a High value-assertion finding. A value test that accepts every wrong value of the right shape is High.
- **B-008, low.** Criteria that do not apply to the repository are absent from the verdict, and wall-clock duration is reported as not measured when nothing executed the tests.
- **B-009, material.** An explicit full-file review (`--files`) reports every seeded old defect and names its mode as full-file. A pull request review names its mode as pr.

Some of these fail on the current release by design: B-001's report half, B-006, B-007, B-008, and B-009's mode name.
The first live run records that as the before state and is not accepted as a baseline.

## Admissible evidence

The `tea-test-review` exit code and the verdict JSON it prints on stdout are admissible.
Oracles read named fields: `recommendation`, `gatingViolations`, `gateOn`, and each `findings[]` record's `row`, `severity`, `file`, `line`, `title`, `provenance` and `verdict_impact`, plus the review-mode field once it exists.
A finding counts only by its row, severity and location; a title or keyword alone establishes nothing.
The Markdown report is measured for size and is never verdict evidence.
Agent prose in free-text fields is never evidence.

## Interfaces and resources in scope

A small adopter-owned wrapper in the evaluation folder builds a disposable git repository from a probe's base and pull-request trees, commits both, and runs `node cli/test-review.js --agent claude --skill-root skills/bmad-testarch-test-review --base-ref <base>` against it, passing the CLI's exit code and stdout through unchanged.
The review skill under test is this repository's working copy of `skills/bmad-testarch-test-review/`.
The agent may read the disposable repository and the skill; the CLI's own isolation stays on.
Fixture repositories are synthetic.
No SEON code, report text or repository name appears in any fixture.

## Boundary conditions

Each probe's fixture is one or two short test files, so a defect's location is unambiguous.
The B-001 fixture puts the old defects a few lines away from the added clean lines, close enough to share a diff hunk's context.
The B-006 and B-007 pairs differ only in the property under test: the branch checks the expected value or not; the type checker runs in CI or not.
The B-003 pair differs only in the commit reviewed: head or merge.
One full-file probe carries 12 seeded defects across rows and severities, mirroring the #857 shape.

## Operational constraints

Live legs run through the local Claude Code CLI on the owner's subscription, with no API key.
The model is the CLI's default Claude model for adopters, recorded as a snapshot in `policy/evaluator-conditions.json`.
Three trials per probe.
Each review gets the CLI's own timeout for a one or two file set.
Estimated live time: about 4 hours for the full corpus.
The evaluation runs from a committed, clean tree; a `--from-working-tree` run is never accepted as a baseline.
No git fetch, worktree creation or commit happens in this repository while a live run is in progress.

## Feared or observed failure modes

Observed in a private pull request review on 2026-10-05:

- a pull-request-scoped review wrote a whole-file report, so the comment said Approve while the report said Request Changes with "before merge" actions for old code;
- a redundant branch that checked the expected value in every case was rated High;
- a type-assignability test was rated High as a failed value test without checking whether a type checker runs;
- two High findings under one row collapsed to one title in the posted summary;
- inapplicable criteria rendered as passes, and test duration was marked PASS from a static read.

Feared:

- a provenance error that classifies an introduced defect as pre-existing and silently passes the gate;
- a narrowed pull request report that drops a real regression whose symptom sits on an unchanged assertion;
- a report-size reduction that loses findings in full-file mode.

Confirmed by: the owner (Murat), 2026-10-08, as drafted, three trials on the CLI default Claude model.
