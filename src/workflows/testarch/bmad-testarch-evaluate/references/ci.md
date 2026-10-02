# CI

Run this stage after the evaluation checks clean and a scored run exists (Stages 1 to 11). It writes `<evaluation-folder>/ci/evaluation-ci-plan.json`, the platform-neutral plan that is the only definition of which check runs when and what blocks, then hands the plan to `bmad-testarch-ci`. Never write a pipeline file here. The plan's schema and placement rules belong to the installed runtime, in `{tea_evaluations_folder}/node_modules/bmad-method-test-architecture-enterprise/cli/lib/evaluate/schemas/evaluation-ci-plan.schema.json` and `{tea_evaluations_folder}/node_modules/bmad-method-test-architecture-enterprise/cli/lib/evaluate/ci-plan.js` (`cli/lib/evaluate/...` from the repository root inside TeA's own package); read them there and copy neither. `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>` reports the plan's findings under the `ci-plan` rule family, so the command that validates the rest of the evaluation validates the plan.

If `check` reports a finding outside the `ci-plan` family, or no scored run exists, name the missing prerequisite and return to its stage before inspecting CI.

For an adopter installation, run every command through `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate ...`. A bare `npx tea-evaluate` fetches an unclaimed registry name, so never write it for an adopter. Inside TeA's own package, run `node cli/evaluate.js` from the repository root.

## Inspect existing CI

Write the findings of every inspection as a `## CI` section of the run's inspection record at `{test_artifacts}/evaluate/<evaluationId>/inspection-record.md` as each one finishes, and end the section with the hand-off status. Each worked example is a separate reservation review repository.

Read the repository's CI definitions before choosing a tier: `.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `.circleci/config.yml`, `Jenkinsfile` or the platform the adopter names. Record the platform, each workflow with the events that start it, the checks the adopter requires before merge, and which events receive which secrets. A pull request from a fork receives no secret on most platforms, while scheduled and tag runs on the default branch do. Required checks live in the platform settings, which files do not show. Read the files first, then ask the adopter for everything they leave open (required checks, merge method, release event and the live-run cost they accept) in one message. Record the file or the answer for every fact. A repository with no pipeline file has no event for `scheduled` or `release` until the adopter names one, and its hand-off uses create mode.

Worked example. `.github/workflows/ci.yml` runs on `pull_request` and `push` to `main`, installs with `npm ci`, runs `npm test` and references no secret except the default token. `.github/workflows/nightly.yml` runs on `schedule` and `workflow_dispatch` and passes `${{ secrets.RESERVATION_MODEL_KEY }}` to a smoke job. The adopter confirms that `ci` is the one required check. The findings: a pull request run has no model secret, so every `pr` check stays deterministic; a scheduled run has the key, so a live check that calls the model has a home on `scheduled`.

## Inspect the merge flow

Read branch protection and the merge method: whether the default branch accepts direct pushes, whether a review is required, and whether a merge queue serializes merges. A merge queue starts a pipeline on the queued commit (`merge_group` on GitHub), so the `merge` tier has an event to hang on. A repository with squash merges, no queue and no push trigger on the default branch has no merge event, so a check placed on `merge` would run nowhere. The pull request pipeline runs the `pr` tier, and a `merge` pipeline runs the `pr` tier first because a tier holds only the checks placed on it.

Worked example. `CONTRIBUTING.md` says "Merges are squashed after one approving review and the `ci` check; there is no merge queue." The workflows list no `merge_group` or push trigger, so the `merge` tier has no event. Keep a live preflight that needs no secret off `merge`, and place it on `scheduled` or `release` with a reason that cites `CONTRIBUTING.md`.

## Inspect the release flow

Read how the adopter ships: tag-triggered publish workflows, deploy workflows, release branches, the cadence and who approves. The `release` tier is a gate before shipping, so it needs a release event: a tag push, a published release, or a deploy workflow. A repository that releases on a tag carries the release gate in that workflow. A repository that deploys nightly ships on the schedule, so the `scheduled` run is also its pre-deploy gate. A repository with no release workflow gets `release` placement only when the adopter names the event. With neither a schedule nor a release event, place the live set on `scheduled` with the `trigger` `["manual-dispatch"]` and say so in the `reason`.

Worked example. `.github/workflows/release.yml` runs on `push` of tags matching `v*`, publishes with `NPM_TOKEN` and holds no model key. `docs/RELEASING.md` says "The tag is the release gate." The evaluated feature is a checked-in rules engine, which needs no model call or secret. The release workflow is where a `release` tier job runs, and with no schedule anywhere in the repository it is also the only home for the live checks.

## Inspect the risk profile

Read the contract's severities and the scoring policy, then price a live run. Record the highest severity the contract declares (`critical` behaviors justify blocking `release`), the cost of one live trial (model calls per trial times the evaluation's `trials` times the probe count, from `evaluation.json` and `corpus-index.json`), the cadence the budget allows, and the reach of a missed defect (who is harmed and how fast it ships). A critical behavior on a feature that deploys nightly justifies a nightly live run. A low-severity behavior on a library released twice a year justifies a live run at release only.

Worked example. The contract declares one `critical` behavior (an over-limit reservation must be declined) and two `material` ones. The evaluation runs three trials over thirteen probes, about forty model calls per live run, which the adopter calls cheap nightly and expensive per pull request. A missed defect reaches customers within a day because of the nightly deploy. The findings: run the live set nightly on `scheduled` and again on `release`, and never on `pr`.

## Place each check

Start every check at AD-10's default tier, then move it only for a recorded reason. The default tiers are:

| Check id              | Default tier                    | Needs a secret or a live target |
| --------------------- | ------------------------------- | ------------------------------- |
| `check`               | `pr`                            | No                              |
| `compile`             | `pr`                            | No                              |
| `seal`                | `pr`                            | No                              |
| `api-conformance`     | `pr`                            | No                              |
| `gameability`         | `pr`                            | No                              |
| `oracle-agreement`    | `pr`                            | No                              |
| `replay`              | `pr`                            | No                              |
| `preflight-live`      | `merge`, `scheduled`, `release` | Yes, a live target              |
| `twin-run`            | `scheduled`, `release`          | Yes, a live target              |
| `held-out`            | `scheduled`, `release`          | Yes, a live target              |
| `judge-calibration`   | `scheduled`, `release`          | Yes, a model judge              |
| `strength-comparison` | `scheduled`, `release`          | Yes, a live run to compare      |

`preflight-live` defaults to `merge` when the target needs no secret and to `scheduled` and `release` otherwise. Every check records `placement`: the chosen `tier`, the `defaultTier` from this table and a `reason`. Write the `reason` for every check, default placements included, and name the file or the adopter's answer the placement came from, such as `.github/workflows/nightly.yml has a schedule trigger and passes RESERVATION_MODEL_KEY`. Record `defaultTier` as the tier the table gives the check for this adopter. A check the table lists on two tiers has one entry per tier it runs on, and each entry's `defaultTier` is its own tier. A target that needs no secret gives `preflight-live` the default `merge` on every entry. A placement outside that default, such as `preflight-live` on `release` for a target that needs no secret, is a deviation: the runtime refuses it without a reason, and the closing summary lists every deviation with its reason so the adopter can overrule it.

## Keep the deterministic checks on pr

Place the gameability arm (`gameability`), contract-source freshness (part of `check`) and oracle-versus-scorer agreement (`oracle-agreement`) on `pr`, with the rest of the deterministic set. They need no secret and call no model, so CAP-11 requires them on every pull request and the runtime refuses a plan that places one elsewhere. No inspection moves them. `replay` and `oracle-agreement` read `baseline/`; until the adopter accepts a clean run with `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate compare --evaluation <evaluation-folder> --accept` in a reviewed change, the `pr` tier exits 64 on them, so tell the adopter the first baseline is part of finishing the stage.

## Place the live checks

Put the live checks where the inspection found a secret and an event: a live `preflight-live` on `merge` only when the merge flow has an event and the target needs no secret, the held-out partition (`held-out`) on `scheduled` and `release`, judge calibration (`judge-calibration`) on `scheduled` and `release` whenever the contract declares a rubric, and `twin-run` and `strength-comparison` with them. Never place a live check on `pr`. A skill or agent target always needs the runner's model credentials, so its live tiers are `scheduled`, `release` and manual dispatch only; its `trigger` lists `schedule` and `manual-dispatch` for `scheduled` and `release` for `release`. Without a schedule trigger in the repository, say so in the `reason` and put the set on `release`, or on `scheduled` with the `trigger` `["manual-dispatch"]` when no release event exists either.

Declare the runner's credential keys as `permittedEnvironmentKeys` through the target's registry `environmentKeys`, which Stage 6 scaffolds and the runtime compiles into the authorization: read them, and add a key name only when a live check needs a credential the registry omits. Keys carry names alone. The plan carries no credential and `bmad-testarch-ci` wires none, so give the adopter the same names as the CI secrets to add for the live tiers.

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

Keep the template's `enforcement` values: `block`, except `warn` where AD-10 says warn, which is a strength regression on `strength-comparison` and the strength floor on `twin-run` and `held-out` on `scheduled`. The runtime refuses `warn` anywhere else.

Worked example, a repository that releases on tags with no model key in CI. The evaluated feature needs no secret and no workflow has a schedule, so the live checks sit on `release`, the one event the repository offers.

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
        "reason": "The target needs no secret, but CONTRIBUTING.md says merges are squashed with no merge queue and no workflow has a merge_group trigger, so .github/workflows/release.yml is the only event."
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
        "reason": "No workflow has a schedule trigger, so no scheduled entry exists, and docs/RELEASING.md names the tag as the release gate."
      }
    }
  ]
}
```

The same evaluation in a repository that deploys nightly with the key on its scheduled runs keeps the AD-10 defaults, and the reasons cite `.github/workflows/nightly.yml`.

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

When the plan already exists, edit it in place: rerun the inspections whose facts changed, keep the reasons that still hold, and add or delete only the checks the change affects. Otherwise copy `assets/evaluation-ci-plan.template.json` to `<evaluation-folder>/ci/evaluation-ci-plan.json`. It holds every check at its AD-10 default with an empty `reason`. Replace each `<evaluation-folder>` with the repository-relative evaluation folder and leave `<invocationId>` literal, since the runtime fills it. Delete the checks the evaluation cannot run, since the runtime exits 64 on them: `api-conformance` for an evaluation that declares no HTTP target, and `judge-calibration` when the contract declares no rubric. Keep the one `preflight-live` set that fits: `merge`, or `scheduled` and `release`. Move the checks the inspection moved, fill every `reason`, add the adopted gates, and set `trigger` to match the tier. Then set `evaluation.json` `tiers` to the tiers the plan places a check on. Keep the evidence paths relative to the evaluation folder.

Run `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate check --evaluation <evaluation-folder>` and repair every `ci-plan` finding before going on: a tier that differs from its default with no reason, a deterministic check placed off `pr`, a live check on `pr`, and a command not led by its tool are authoring defects. Show the adopter the placement table with each deviation and its reason before the hand-off. When `<evaluation-folder>/baseline/` is absent, show the adopter the latest clean scored run and, once they confirm it, accept it with `npm exec --prefix {tea_evaluations_folder} -- tea-evaluate compare --evaluation <evaluation-folder> --accept`; the adopter commits `baseline/` with the plan in one reviewed change. An adopter who declines leaves the stage pending, and the closing summary says why.

## Hand the plan to the CI skill

Invoke `bmad-testarch-ci` in edit mode on the adopter's pipeline file, naming the plan's path, or in create mode when the inspection found no pipeline file. Its steps detect `ci/evaluation-ci-plan.json`, validate it and render one job per tier. The rendering rules belong to its `steps-c/step-03b-render-evaluation-plans.md`. When that skill is not installed, give the adopter the request and the plan's path and mark the stage pending in the inspection record. Stage 12 is complete when the plan passes `check`, the baseline is accepted or its pending reason is recorded, and the hand-off is made. Finish with the closing summary: the placement table, the deviations and their reasons, the secrets the live tiers need (the names from `environmentKeys`), the gates adopted, and the baseline still to accept.
