# Evaluate assets

Templates an authored evaluation starts from.
Each ships with the values only the adopter can choose left `null`, so a copy validates only once those are filled.
The one exception is the scoring-policy template's `parentDigest: null`, which is already its final value: a new policy has no parent.

- `scoring-policy.template.json` becomes `policy/scoring-policy.json`, eval-quality's scoring policy.
  The adopter sets `policyId`, `severityFloor`, `catchThreshold` and `minimumTrialCount`; `confidenceThreshold` and the three caps carry eval-quality's published defaults, which the adopter may change.
- `evaluator-conditions.template.json` becomes `policy/evaluator-conditions.json`, the model a run uses and the digest of its system prompt, which `tea-evaluate run` records in every run's evaluator configuration.
  Its `judge.modelSnapshot` is filled when the contract declares a rubric, naming the model the rubric judge runs; when the contract declares no rubric, delete the `judge` block, since `tea-evaluate check` refuses one nothing uses.
  When the judge is the only model the evaluation uses, the file carries `modelSnapshot: "none"`, the digest of the empty byte string as `systemPromptDigest`, and the `judge` block.
  An evaluation in which no model runs anywhere (target, evaluator and judge) leaves the file out.
- `evaluation-folder.gitignore` becomes the evaluation folder's `.gitignore`, which keeps `runs/` out of the adopter's commits.
