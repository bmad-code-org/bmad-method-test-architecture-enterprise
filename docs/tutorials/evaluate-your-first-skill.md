---
title: 'Evaluate Your First Skill'
description: 'Take one small skill from a confirmed requirements statement to a scored evaluation, an accepted baseline and a passing pull request check, with no credential and no model'
---

**Evaluate** (`bmad-testarch-evaluate`) scores how an AI skill, agent or feature behaves against requirements you confirm.
This tutorial evaluates one small skill, `refund-check`, from the requirements you confirm to a scored run, an accepted baseline and a passing pull request check.

## What You'll Build

By the end of this 15-minute tutorial, you'll have:

- A confirmed requirements statement for the skill
- A scored run in which a seeded defect in the skill is caught and two clean controls pass
- An accepted baseline that later runs are compared with
- A passing `tea-evaluate ci --tier pr`, the check a pull request runs

## Prerequisites

- Node.js 22.20 or later
- A checkout of the TeA repository with its dependencies installed:

```shell
git clone https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise.git
cd bmad-method-test-architecture-enterprise
npm ci
```

- macOS, or Linux with `bubblewrap` and `strace` installed, since Evaluate confines every target it runs (see [File-system confinement](/docs/reference/tea-evaluate-cli.md#file-system-confinement))

You need no API key, no network access and no model.
A small stub agent stands in for the model that would normally follow the skill.

Run every command of this tutorial from the root of the checkout, in one terminal session.

## The Skill Under Evaluation

`refund-check` is a skill that decides whether a refund request is within the refund limit.
The fixture holds its `SKILL.md`:

```markdown
---
name: refund-check
description: 'Decide whether a refund request is within the refund limit. Use when a refund amount and the limit are given.'
---

# Refund check

You receive a request that gives a refund amount and the refund limit.

Reply with one JSON object on one line and nothing else: `{"status": "answered", "decision": "approved", "amount": 100}`, where `decision` is `approved` or `declined` and `amount` repeats the amount of the request.

Approve a refund when its amount is at or below the limit.
Decline a refund when its amount is above the limit.

When the request gives no amount and limit, reply `{"status": "refused"}`.
```

The rule that matters is the inclusive limit: a refund of 100 against a limit of 100 is approved.
A careless edit of that one line, from "at or below" to "below", would decline it.
The evaluation you build proves that Evaluate notices such an edit.

## Step 1: Intake

Evaluate starts from a conversation.
Start it in your coding agent:

- **Claude Code / Cursor / Windsurf:** `/bmad-testarch-evaluate`
- **Codex:** `$bmad-testarch-evaluate`
- **Inside a `/bmad-tea` chat:** `EV`

Evaluate inspects the skill first and records what it finds: `skill/SKILL.md` activates it, one request enters on standard input, so the target kind is `skill`, reached through the command line with TeA's `tea-skill-runner`.
Then it asks six questions, one for each family of facts that inspection cannot settle.

**Q: Which decisions matter most?**
A: "Approving a refund that is exactly at the limit.
That one is critical.
Refusing a malformed request matters less."

**Q: Which outputs can we trust as proof?**
A: "The JSON object the skill prints.
Read its `status` and `decision`."

**Q: Which commands and resources may run?**
A: "The skill runner over `skill/`.
The agent behind it reads only the skill and the request."

**Q: Where does the behavior change?**
A: "At the limit.
A refund of 100 against a limit of 100 is eligible.
A request with no amount and limit is refused."

**Q: What are the time, secret and environment limits?**
A: "A 30 second ceiling per command, a disposable copy of the project, no secret, no network."

**Q: Which failures have happened or would hurt most?**
A: "Someone rewords the approval rule and the limit turns exclusive."

Evaluate writes the answers into a requirements statement, reads it back to you and stops until you confirm it.
After you confirm, the exact bytes go into the evaluation folder as `requirements.md`:

```markdown
# Requirements statement: refund check

## What must be proven

The refund-check skill approves a refund whose amount is exactly the limit (B-001, critical). It refuses a request that gives no amount and limit (B-002, material).

## Admissible evidence

The skill runner's stdout is admissible. The skill replies with one JSON object, and the evaluation reads its `status` and `decision` fields.

## Interfaces and resources in scope

Use `tea-skill-runner` over `skill/`. The agent behind it reads only the skill and the request.

## Boundary conditions

A refund of 100 against a limit of 100 is eligible. The limit is inclusive. A request with no amount and limit, or one that is not text, is refused.

## Operational constraints

Run in a disposable copy with a 30 second command ceiling. The run needs no secret, no network access and no model.

## Feared or observed failure modes

An edit to the skill's wording can turn the inclusive limit into an exclusive one, so the skill declines a refund exactly at the limit.

Confirmed by: tutorial reader, 2026-10-07.
```

The skill goes on to the corpus, the contract, the oracles and the adapters, which are stages 3 to 6 of its twelve.
The fixture `test/fixtures/evaluate-tutorial/` already holds the finished result of that work, so the rest of this tutorial runs the evaluation and leaves its authoring to the skill.

## Step 2: Set Up the Project

Copy the fixture to a scratch directory, so the commands write no file into your checkout.
The fixture ships with the baseline of its last accepted run, and a run directory if one was made.
Remove both, since your own run becomes the first baseline.

```bash
export PROJECT="$(mktemp -d)/refund-project"
cp -R test/fixtures/evaluate-tutorial "$PROJECT"
rm -rf "$PROJECT/evaluation/baseline" "$PROJECT/evaluation/runs"
```

An evaluation runs the skill through `tea-skill-runner` inside a disposable copy of the project, and a confined run grants the trial that copy.
The fixture's registry entry in `evaluation.json` therefore names the runner as a path inside the project:

```json
{
  "interfaceId": "refund-skill",
  "executable": "tea-skill-runner",
  "target": "node_modules/.bin/tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": [],
  "maxElapsedMs": 100000,
  "infrastructureExitCodes": [3, 4, 5, 6]
}
```

A runner outside the project, such as a bare `tea-skill-runner` that your install resolves from elsewhere, is read outside what the trial was granted, and `score` then exits 3 with `isolation manifest violation: mount outside allowlist`.
Two setups avoid that: a `target` that is a path inside `launch.root`, as here, or the bare name with the install directories the audit names declared in `systemPaths` on the entry.
The reference section [Where the runner lives](/docs/reference/tea-evaluate-cli.md#where-the-runner-lives) and the how-to section on [exit 3 with `mount outside allowlist`](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md#if-score-exits-3-with-mount-outside-allowlist) cover both.
In your own project, `npm install --prefix evals bmad-method-test-architecture-enterprise eval-quality` puts the runner in `evals/node_modules`.
Here the next commands place the same files under `node_modules` from your checkout, so the tutorial needs no registry access.

```bash
mkdir -p "$PROJECT/node_modules/.bin" "$PROJECT/node_modules/bmad-method-test-architecture-enterprise"
cp -R cli package.json "$PROJECT/node_modules/bmad-method-test-architecture-enterprise/"
cp -R node_modules/commander "$PROJECT/node_modules/commander"
ln -s ../bmad-method-test-architecture-enterprise/cli/skill-runner.js "$PROJECT/node_modules/.bin/tea-skill-runner"
```

List the evaluation folder:

```bash
(cd "$PROJECT/evaluation" && find . -type f | LC_ALL=C sort)
```

You should see:

```text
./.gitignore
./ci/evaluation-ci-plan.json
./contract.json
./corpus-index.json
./corpus/README.md
./evaluation.json
./mutations/M-001.mutation.json
./policy/evaluator-conditions.json
./policy/scoring-policy.json
./probes/P-001.probe.json
./probes/P-002.probe.json
./probes/P-003.probe.json
./requirements.md
```

Each file holds one part of the evaluation:

- `evaluation.json` names the target, the way to launch it, the arms to run and the number of trials.
- `contract.json` holds the behaviors that must hold and the oracles that read the evidence, including `B-001`, the refund at the limit.
- `probes/` holds three probes.
  `P-001` and `P-003` are clean controls that the unmodified skill must pass.
  `P-002` is the seeded defect.
- `mutations/M-001.mutation.json` is the controlled edit behind `P-002`: it replaces "at or below the limit" with "below the limit" in `skill/SKILL.md`.
- `policy/` holds the scoring policy and the conditions the run is recorded under.
- `ci/evaluation-ci-plan.json` places each check on a CI tier.

The reference describes every file in [The evaluation folder](/docs/reference/tea-evaluate-cli.md#the-evaluation-folder).

## Step 3: Check the Folder

`check` validates the evaluation folder and lists every authoring defect it finds:

```bash
node cli/evaluate.js check --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate check: … has no authoring defects
```

A defect would exit with 10 and list each one.
The reference lists every exit under [exit codes](/docs/reference/tea-evaluate-cli.md#exit-codes), and [`check`](/docs/reference/tea-evaluate-cli.md#check) describes the rules it applies.

## Step 4: Digest the Corpus

`digest` writes `corpus-index.json`, the list of every corpus, probe and mutation file with its checksum, and prints the digest of that index:

```bash
node cli/evaluate.js digest --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate digest: wrote …/corpus-index.json (5 file(s))
sha256:56758abf5e992f92843b86016265b3f51fc20665c03988f4dc40ab3274eb9f98
```

The index is already current, so the digest matches the one the fixture was built with.
`check` refuses a stale index, which keeps a probe from changing without a trace.
See [`digest`](/docs/reference/tea-evaluate-cli.md#digest).

## Step 5: Preflight

`preflight` proves the evaluation can measure something before it spends a trial.
It launches the skill in a disposable copy and qualifies each seeded probe: it applies the mutation, checks that the defect shows, restores the original bytes and checks that the clean skill passes again.

```bash
node cli/evaluate.js preflight --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate preflight: probes/P-002.probe.json: qualifying through M-001 in …
tea-evaluate preflight: M-001: step 1, the clean arm
tea-evaluate preflight: M-001: step 2, the mutation applied to skill/SKILL.md
tea-evaluate preflight: M-001: step 3, the mutated arm
tea-evaluate preflight: M-001: step 4, the original bytes restored
tea-evaluate preflight: M-001: step 5, the restored digest checked
tea-evaluate preflight: M-001: step 6, the baseline re-run (attempt 1 of 3)
tea-evaluate preflight: probes/P-002.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate preflight: eval-quality preflight exited 0; its verdict and diagnostics are in runs/…
```

The verdict comes from eval-quality's own `preflight`, which `tea-evaluate` calls and whose exit it passes through.
A probe whose mutation does not make the defect show stops `preflight` with exit 11 and names the probe.
A failed eval-quality preflight exits 3 and leaves its verdict under `runs/`.
See [`preflight`](/docs/reference/tea-evaluate-cli.md#preflight).

## Step 6: Run the Evaluation

`run` repeats the preflight, then runs every arm the probes need: the clean arm against the skill as it is, and the mutated arm against the skill with `M-001` applied.
Each arm runs three trials, each in a fresh disposable copy.

```bash
node cli/evaluate.js run --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate run: probes/P-002.probe.json: qualified; the restored digest matched and the baseline passed again
tea-evaluate run: probes/P-001.probe.json: qualified; its baseline passed
tea-evaluate run: probes/P-003.probe.json: qualified; its baseline passed
tea-evaluate run: clean: trial 1 of 3
tea-evaluate run: clean: trial 3 of 3
tea-evaluate run: mutated:M-001: trial 1 of 3
tea-evaluate run: mutated:M-001: trial 3 of 3
tea-evaluate run: 3 trial set(s) of 3 trial(s) sealed over clean, mutated:M-001; score them with tea-evaluate score --run …
```

The trials are sealed under `runs/<invocationId>/` in the evaluation folder.
Nothing is scored yet: `run` records what the skill did.
See [`run`](/docs/reference/tea-evaluate-cli.md#run).

## Step 7: Score the Run

`score` hands every probe's trials to `eval-quality score`, which applies the oracles and the scoring policy and seals the evidence:

```bash
node cli/evaluate.js score --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate score: P-001: eval-quality score exited 0
tea-evaluate score: P-002: eval-quality score exited 0
tea-evaluate score: P-003: eval-quality score exited 0
tea-evaluate score: strength aggregate: eval-quality aggregate-strength exited 0
```

With no `--run`, `score` takes the most recent run.
Exit 0 means eval-quality accepted the evidence and recorded a score for each probe.
The strength aggregate says how well the evaluation catches defects.
Read it:

```bash
grep -o '"defect":{[^}]*}' "$PROJECT"/evaluation/runs/*/scores/*/strength-aggregate.json
```

You should see:

```text
"defect":{"caught":1,"comparable":true,"eligible":1,"exercised":1,"rate":1}
"defect":{"basis":"rate-meets-floor","decision":"meets","floor":1}
```

The first line reads: the evaluation exercised the one defect class probe, `P-002`, and caught it, a rate of 1.
The second line reads: that rate meets the floor of 1 that `evaluation.json` declares.
The oracle that reads the refund at the limit passed on every clean trial and failed on every mutated trial, which is exactly what a working evaluation shows.
See [`score`](/docs/reference/tea-evaluate-cli.md#score).

## Step 8: Compare and Accept a Baseline

A baseline is the accepted record of a good run.
Later runs are compared with it, so a regression in how well the evaluation catches defects shows up as a difference.
Compare the run with the baseline:

```bash
node cli/evaluate.js compare --evaluation "$PROJECT/evaluation"
```

You should see:

```text
tea-evaluate compare: first-run: baseline/ holds no baseline to compare run … with; accept it with tea-evaluate compare --accept
```

The outcome is `first-run`, since your copy has no baseline.
Accept the run:

```bash
node cli/evaluate.js compare --evaluation "$PROJECT/evaluation" --accept
```

You should see:

```text
tea-evaluate compare: accepted: run … is the baseline, … file(s) under baseline/
```

`--accept` replaces `baseline/` with a byte-identical snapshot of the run.
In a real project the `baseline/` folder is committed, and a reviewer reads the pull request that changes it.
See [`compare`](/docs/reference/tea-evaluate-cli.md#compare).

## Step 9: Run the Pull Request Check

`ci` runs the checks that `ci/evaluation-ci-plan.json` places on one tier.
The `pr` tier holds the checks that need no secret and no model, so every pull request can run them:

```bash
node cli/evaluate.js ci --evaluation "$PROJECT/evaluation" --tier pr
```

You should see:

```text
check: exit 0 (pass), pass
compile: exit 0 (pass), pass
seal: exit 0 (pass), pass
oracle-agreement: exit 0 (pass), pass
replay: exit 0 (pass), pass
tea-evaluate ci: 5 check(s) of the pr tier ran, 0 blocking, 0 warning; the evidence is in runs/…
```

Each line is one check:

- `check` validates the folder again.
- `compile` and `seal` run eval-quality over the contract.
- `oracle-agreement` reads the baseline evidence for an oracle whose judgment disagrees with the evidence.
- `replay` replays the baseline through eval-quality's `preflight` and `score` and compares the result with the baseline byte for byte, so a baseline that no longer holds fails here.

The final exit is the most severe blocking result of the tier, and 0 means no check blocks the pull request.
In a pipeline, `bmad-testarch-ci` renders one `tea-evaluate ci` step per tier from this plan.
See [`ci`](/docs/reference/tea-evaluate-cli.md#ci).

## What You Learned

You took a skill from a confirmed requirements statement to a scored evaluation:

- Intake turns your answers into a requirements statement that the evaluation is held to.
- `check` and `digest` keep the folder consistent, and `preflight` proves the seeded defect shows and rolls back.
- `run` and `score` measure the clean arm and the mutated arm, and the strength aggregate says whether the defect was caught.
- `compare --accept` records the baseline, and `ci --tier pr` replays it on every pull request.

## Next Steps

- [Evaluate a Skill or Agent](/docs/how-to/evaluate/evaluate-a-skill-or-agent.md) for your own skill, with a real agent behind the runner
- [Read the Gaps and Fix Them](/docs/how-to/evaluate/read-the-gaps-and-fix-them.md) when an evaluation scores weak
- [Compare Runs and Accept a Baseline](/docs/how-to/evaluate/compare-runs-and-accept-a-baseline.md)
- [Put an Evaluation in CI](/docs/how-to/evaluate/put-an-evaluation-in-ci.md)
- [How Evaluate Works](/docs/explanation/how-evaluate-works.md) for the reasons behind probes, mutations and baselines
- [tea-evaluate CLI](/docs/reference/tea-evaluate-cli.md) for every command, option and exit code
