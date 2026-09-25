# Evaluate assets

Templates an authored evaluation starts from.
Each ships with the values only the adopter can choose left `null`, so a copy validates only once those are filled.

- `scoring-policy.template.json` becomes `policy/scoring-policy.json`, eval-quality's scoring policy.
  The adopter sets `policyId`, `severityFloor`, `catchThreshold` and `minimumTrialCount`; `confidenceThreshold` and the three caps carry eval-quality's published defaults, which the adopter may change.
- `evaluator-conditions.template.json` becomes `policy/evaluator-conditions.json`, the model a run uses and the digest of its system prompt, which `tea-evaluate run` records in every run's evaluator configuration.
  An evaluation whose target and evaluator use no model leaves the file out.
- `evaluation-folder.gitignore` becomes the evaluation folder's `.gitignore`, which keeps `runs/` out of the adopter's commits.
