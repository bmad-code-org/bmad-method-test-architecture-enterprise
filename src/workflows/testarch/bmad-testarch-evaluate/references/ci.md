# CI

Run this stage after the evaluation checks clean and a scored run exists (Stages 1 to 11). It writes `<evaluation-folder>/ci/evaluation-ci-plan.json`, the platform-neutral plan that is the only definition of which check runs when and what blocks, then hands the plan to `bmad-testarch-ci`. Never write a pipeline file here. The plan's schema and placement rules belong to the installed runtime, in `{tea_evaluations_folder}/node_modules/bmad-method-test-architecture-enterprise/cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` and `{tea_evaluations_folder}/node_modules/bmad-method-test-architecture-enterprise/cli/lib/evaluate/ci-plan.js` (`cli/lib/evaluate/...` from the repository root inside TeA's own package); read them there and copy neither. `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>` reports the plan's findings under the `ci-plan` rule family, so the command that validates the rest of the evaluation validates the plan.

If `check` reports a finding outside the `ci-plan` family, or no scored run exists, name the missing prerequisite and return to its stage before inspecting CI.

For an adopter installation, run every command through `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate ...`. A bare `npx tea-evaluate` fetches an unclaimed registry name, so never write it for an adopter. Inside TeA's own package, run `node cli/evaluate.js` from the repository root.

## Inspect existing CI

Write the findings of every inspection as a `## CI` section of the run's inspection record at `{test_artifacts}/evaluate/<evaluationId>/inspection-record.md` as each one finishes, and end the section with the hand-off status.

Read the repository's CI definitions before choosing a tier: `.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/config.yml`, `Jenkinsfile` or the platform the adopter names. Record the platform, each workflow with the events that start it, the checks the adopter requires before merge, and which events receive which secrets. A pull request from a fork receives no secret on most platforms, while scheduled and tag runs on the default branch do. Required checks live in the platform settings, which files do not show. Read the files first, then ask the adopter for everything they leave open (required checks, merge method, release event and the live-run cost they accept) in one message. Record the file or the answer for every fact. A repository with no pipeline file hands off in create mode, and the adopter names the schedule and release events they want. Each worked example below is a separate reservation review repository.

Worked example. `.github/workflows/ci.yml` runs on `pull_request` and `push` to `main`, installs with `npm ci`, runs `npm test` and references no secret except the default token. `.github/workflows/nightly.yml` runs on `schedule` and `workflow_dispatch` and passes `${{ secrets.RESERVATION_MODEL_KEY }}` to a smoke job. The adopter confirms that `ci` is the one required check. The findings: a pull request run has no model secret, so every `pr` check stays deterministic; a scheduled run has the key, so a live check that calls the model has a home on `scheduled`.

## Inspect the merge flow

Read branch protection and the merge method: whether the default branch accepts direct pushes, whether a review is required, and whether a merge queue serializes merges. Every repository has a post-merge event, the push to the default branch or, with a queue, the pipeline run on the queued commit. Squash merges and the absence of a queue are therefore no reason to move a `merge` check. The reason to move one is cost or risk the adopter states: a live preflight that outlasts the time the merge flow allows, for example. Step-03b of `bmad-testarch-ci` maps the tier to the event.

Worked example. `CONTRIBUTING.md` says "Merges go through the merge queue, which re-runs the `test` check on the queued commit", and `ci.yml` lists `merge_group`. The post-merge run exists, so a live preflight that needs no secret keeps its `merge` default and its reason cites `ci.yml` and `CONTRIBUTING.md`. If `CONTRIBUTING.md` instead capped the post-merge run at ten minutes and the preflight took forty, the reason for moving it to `release` would cite that cap.

## Inspect the release flow

Read how the adopter ships: tag-triggered publish workflows, deploy workflows, release branches, the cadence and who approves. The event of the `release` tier is whatever starts the repository's release or deploy workflow: a tag push, a published release, or the deploy workflow's own trigger, a nightly one included. A repository with none of these gets a published release from step-03b, and the reason says so. A `scheduled` run gates nothing unless the deploy waits for it.

Worked example. `.github/workflows/release.yml` runs on `push` of tags matching `v*`, publishes with `NPM_TOKEN` and holds no model key. `docs/RELEASING.md` says "The tag is the release gate." The evaluated feature is a checked-in rules engine, which needs no model call or secret. The tag push is the `release` event, and with no schedule anywhere in the repository it is also the only home for the live set.

## Inspect the risk profile

Read the contract's severities and the scoring policy, then price a live run. Record the highest severity the contract declares (`critical` behaviors justify blocking `release`), the cost of one live trial (model calls per trial times the evaluation's `trials` times the probe count, from `evaluation.json` and `corpus-index.json`), the cadence the budget allows, and the reach of a missed defect (who is harmed and how fast it ships). A critical behavior on a feature that deploys nightly justifies a nightly live run. A low-severity behavior on a library released twice a year justifies a live run at release only. When severity and cost do not justify a scheduled run, delete the scheduled entries and say why in the `reason` of the release entries.

Worked example. The contract declares one `critical` behavior (an over-limit reservation must be declined) and two `material` ones. The evaluation runs three trials over thirteen probes, about forty model calls per live run, which the adopter calls cheap nightly and expensive per pull request. A missed defect reaches customers within a day because of the nightly deploy. The findings: run the live set nightly on `scheduled` and again on `release`, and never on `pr`.

## Place each check

Start every check at AD-10's default tier, then move it only for a recorded reason. `DEFAULT_TIERS` in the installed `ci-plan.js` holds the defaults, and `assets/evaluation-ci-plan.template.json` carries every one as data, so read the tier of a check from them and copy no table. The deterministic set (`check`, `compile`, `seal`, `api-conformance`, `gameability`, `oracle-agreement`, `replay`) needs no secret and calls no model. The live set (`preflight-live`, `twin-run`, `held-out`, `judge-calibration`, `strength-comparison`) needs a live target, a model judge or a run to compare. `preflight-live` defaults to `merge` when the target needs no secret and to `scheduled` and `release` otherwise.

Every check records `placement`: the chosen `tier`, the `defaultTier` and a `reason`. Write the `reason` for every check, default placements included, and name the file or the adopter's answer the placement came from, such as `.github/workflows/nightly.yml has a schedule trigger and passes RESERVATION_MODEL_KEY`. Record `defaultTier` as the tier AD-10 gives the check for this adopter. For a target that needs no secret, `preflight-live` defaults to `merge` on every entry the plan keeps, one moved to `release` included. Every other check, and `preflight-live` for a target that needs a secret, has the tier of its own entry as its default, and a check the plan keeps on two tiers has one entry per tier. A placement outside that default, such as `preflight-live` on `release` for a target that needs no secret, is a deviation: the runtime refuses it without a reason, and the closing summary lists every deviation with its reason so the adopter can overrule it.

## Keep the deterministic checks on pr

Place the gameability arm (`gameability`), contract-source freshness (part of `check`) and oracle-versus-scorer agreement (`oracle-agreement`) on `pr`, with the rest of the deterministic set. They need no secret and call no model, so CAP-11 requires them on every pull request and the runtime refuses a plan that places one elsewhere. No inspection moves them. Every check that reads `baseline/` (`replay`, `gameability`, `oracle-agreement`, and `twin-run` and `strength-comparison` on the live tiers) exits 64 until the adopter accepts a clean run with `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate compare --evaluation <evaluation-folder> --accept` in a reviewed change, so tell the adopter the first baseline is part of finishing the stage.

## Place the live checks

Put the live checks where the inspection found a secret and an event: a live `preflight-live` on `merge` when the target needs no secret and the merge flow allows its run time, the held-out partition (`held-out`) on `scheduled` and `release`, judge calibration (`judge-calibration`) on `scheduled` and `release` whenever the contract declares a rubric, and `twin-run` and `strength-comparison` with them. Never place a live check on `pr`. A skill or agent target always needs the runner's model credentials, so its live tiers are `scheduled`, `release` and manual dispatch only; its `trigger` lists `schedule` and `manual-dispatch` for `scheduled` and `release` for `release`. Without a schedule trigger in the repository, say so in the `reason` and put the set on `release`.

Declare the runner's credential keys as `permittedEnvironmentKeys` through the target's registry `environmentKeys`, which Stage 6 scaffolds and the runtime compiles into the authorization: read them, and add a key name only when a live check needs a credential the registry omits. On Linux the live checks also need the target's registry entry to declare `"network": "host"`, since a confined target with the default network has a loopback only and cannot reach its model provider. Keys carry names alone. The plan carries no credential and `bmad-testarch-ci` wires none, so give the adopter the same names as the CI secrets to add for the live tiers.

<!-- example:ci-registry -->

```json
{
  "interfaceId": "reservation-review-skill",
  "executable": "tea-skill-runner",
  "target": "tea-skill-runner",
  "subcommandPaths": [[]],
  "artifacts": {},
  "environmentKeys": ["RESERVATION_MODEL_KEY"],
  "maxElapsedMs": 60000,
  "infrastructureExitCodes": [3, 4, 5, 6]
}
```

Keep the template's `enforcement` values. The runtime refuses `warn` where AD-10 allows none.

Worked example, a repository that releases on tags with no model key in CI; the plan shows two of its entries. The evaluated feature needs no secret and no workflow has a schedule, so the live checks sit on `release`, the one event the repository offers.

<!-- example:ci-plan -->

```json
{
  "schemaVersion": 1,
  "checks": [
    {
      "id": "preflight-live",
      "tier": "release",
      "trigger": ["release"],
      "kind": "evaluate",
      "command": ["tea-evaluate", "preflight", "--evaluation", "evals/reservation-review"],
      "enforcement": "block",
      "evidence": ["runs/<invocationId>/checks/preflight-live/stdout"],
      "placement": {
        "tier": "release",
        "defaultTier": "merge",
        "reason": "The target needs no secret, but CONTRIBUTING.md caps the post-merge run at ten minutes and a live preflight takes about forty, so it runs at the tag in .github/workflows/release.yml."
      }
    },
    {
      "id": "twin-run",
      "tier": "release",
      "trigger": ["release"],
      "kind": "evaluate",
      "command": ["tea-evaluate", "ci", "--evaluation", "evals/reservation-review", "--tier", "release"],
      "enforcement": "block",
      "evidence": ["runs/<invocationId>/checks/twin-run/stdout"],
      "placement": {
        "tier": "release",
        "defaultTier": "release",
        "reason": "No workflow has a schedule trigger, so no scheduled entry exists, and docs/RELEASING.md names the tag push as the release gate."
      }
    }
  ]
}
```

The same evaluation in a repository that deploys nightly, with the key on its scheduled runs, places the live set twice at its defaults: on `scheduled` for `.github/workflows/nightly.yml`, and on `release` for the trigger of the deploy workflow in `.github/workflows/deploy.yml`.

<!-- example:ci-plan -->

```json
{
  "schemaVersion": 1,
  "checks": [
    {
      "id": "twin-run",
      "tier": "scheduled",
      "trigger": ["schedule", "manual-dispatch"],
      "kind": "evaluate",
      "command": ["tea-evaluate", "ci", "--evaluation", "evals/reservation-review", "--tier", "scheduled"],
      "enforcement": "warn",
      "evidence": ["runs/<invocationId>/checks/twin-run/stdout"],
      "placement": {
        "tier": "scheduled",
        "defaultTier": "scheduled",
        "reason": ".github/workflows/nightly.yml runs on schedule with RESERVATION_MODEL_KEY, and the nightly deploy makes a day the longest a defect may live."
      }
    },
    {
      "id": "twin-run",
      "tier": "release",
      "trigger": ["release"],
      "kind": "evaluate",
      "command": ["tea-evaluate", "ci", "--evaluation", "evals/reservation-review", "--tier", "release"],
      "enforcement": "block",
      "evidence": ["runs/<invocationId>/checks/twin-run/stdout"],
      "placement": {
        "tier": "release",
        "defaultTier": "release",
        "reason": ".github/workflows/deploy.yml ships main to production on its own schedule, and that trigger is the release event."
      }
    }
  ]
}
```

## Offer eval-quality-gates

`eval-quality-gates` enforces repository policy and is opt-in. Offer the gates once, with a line each on what they check, and add only the ones the adopter adopts. List the gates with `npm exec --prefix {tea_evaluations_folder} -- eval-quality-gates --help` and take each adopted gate's section shape from the eval-quality documentation; never guess a section. A gate is configured by its own section of `eval-quality.config.json`; add a section for each adopted gate and never rewrite, reorder or reformat a section that exists. Read the file first, and when a section for the gate is already there, adopt it as it stands. Each adopted gate joins the plan as a `gate` check on `pr`, since a repository-policy gate needs no secret. Its `id` is the gate's name and its `command` is led by `eval-quality-gates`.

<!-- example:gates-config-before -->

```json
{
  "licences": { "lockfiles": ["package-lock.json"], "allowlist": ["MIT", "ISC"] }
}
```

<!-- example:gates-config-after -->

```json
{
  "licences": { "lockfiles": ["package-lock.json"], "allowlist": ["MIT", "ISC"] },
  "lockfile-age": { "lockfiles": ["package-lock.json"], "windowDays": 7 }
}
```

<!-- example:gate-check -->

```json
{
  "schemaVersion": 1,
  "checks": [
    {
      "id": "lockfile-age",
      "tier": "pr",
      "trigger": ["pull-request"],
      "kind": "gate",
      "command": ["eval-quality-gates", "lockfile-age"],
      "enforcement": "block",
      "evidence": ["runs/<invocationId>/checks/lockfile-age/stdout"],
      "placement": {
        "tier": "pr",
        "defaultTier": "pr",
        "reason": "The adopter adopted the lockfile-age gate; package-lock.json is the only lockfile and a repository-policy gate needs no secret."
      }
    }
  ]
}
```

## Write the plan

When the plan already exists, edit it in place: rerun the inspections whose facts changed, keep the reasons that still hold, add or delete only the checks the change affects, and derive `tiers` again. Otherwise copy `assets/evaluation-ci-plan.template.json` to `<evaluation-folder>/ci/evaluation-ci-plan.json`. It holds every check at its AD-10 default with an empty `reason`. Replace each `<evaluation-folder>` with the repository-relative evaluation folder and leave `<invocationId>` literal, since the runtime fills it. Delete the checks the evaluation cannot run: `api-conformance` for an evaluation that declares no HTTP target, which the runtime exits 64 on, and `judge-calibration` when the contract declares no rubric and `gameability` when no probe takes the gameability route, which pass as no-ops and so would leave the plan claiming checks that never ran. Keep the one `preflight-live` set that fits: the `merge` entry when the target needs no secret, the `scheduled` and `release` entries when it does (a skill or agent target is always this case), or a single entry moved off its default, as the first worked example shows. Set `defaultTier` on each kept entry by the rule in `Place each check`. Move the checks the inspection moved, fill every `reason`, add the adopted gates, and set `trigger` to match the tier. Then set `evaluation.json` `tiers` to the tiers the plan places a check on. Keep the evidence paths relative to the evaluation folder.

Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>` and repair every `ci-plan` finding before going on: a tier that differs from its default with no reason, a deterministic check placed off `pr`, a live check on `pr`, and a command not led by its tool are authoring defects. Show the adopter the placement table with each deviation and its reason before the hand-off. When `<evaluation-folder>/baseline/` is absent, show the adopter the latest clean scored run and, once they confirm it, accept it with `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate compare --evaluation <evaluation-folder> --accept`; the adopter commits `baseline/` with the plan in one reviewed change. An adopter who declines leaves the baseline an open item, and the closing summary says why.

With no accepted baseline, skip the tier runs and record that in the `## CI` section. After the baseline is accepted, run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate ci --evaluation <evaluation-folder> --tier <tier>` for each tier that can run on this machine (`pr` always, and each live tier whose target launches here and whose credentials exist) and show the adopter each exit. A blocking exit names the stage that owns its repair, and Stage 11's guide lists the repair for each exit: an oracle that disagrees with its scorer returns to Stage 5, and a strength floor on a class with no eligible probe returns to Stage 3 or Stage 8. Record the exit and that stage in the `## CI` section, tell the adopter, and carry on with the hand-off. Record every tier the plan places a check on, with its exit or the reason it was not run.

## Hand the plan to the CI skill

Invoke `bmad-testarch-ci` in edit mode on the adopter's pipeline file, naming the plan's path, or in create mode when the inspection found no pipeline file. Its steps detect `ci/evaluation-ci-plan.json` and validate it, and the rendering rules belong to its `steps-c/step-03b-render-evaluation-plans.md`. Name in the request the concrete event of this repository for each tier it should render, such as `release`: the push of `v*` tags that starts `.github/workflows/release.yml`. Gating an existing publish or deploy job on the evaluation job is outside what that step does for a job it did not write, so tell the adopter. When that skill is not installed, give the adopter the request and the plan's path and record the hand-off as an open item in the inspection record. Stage 12 is complete when the plan passes `check` and the hand-off is made; a declined baseline or a missing `bmad-testarch-ci` stays a named open item in the `## CI` section and does not reopen the stage. Finish with the closing summary: the placement table, the deviations and their reasons, the secrets the live tiers need (the names from `environmentKeys`), the gates adopted, the baseline still to accept, every tier that exited non-zero with the stage that owns its repair, and whether a publish or deploy job waits for the evaluation job, which is the adopter's to wire.
