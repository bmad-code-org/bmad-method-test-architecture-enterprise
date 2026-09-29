# Scoring policy decision

The adopter confirmed this policy on 2026-09-28 during Story 1.24 review. The policy ID is `test-review-material-v1`, the severity floor is `low`, the catch threshold is `0.9`, and the minimum trial count is three. The confirmed intake already set three trials and ranked missed findings and false positives as material.

The low floor includes every recorded defect class. With eval-quality's strict `caughtCount / validCount > catchThreshold` rule, three valid trials require three catches. The deterministic evaluator remains selected because the documented CLI output has exact status, finding and error predicates. The policy bytes used in the recorded test-review runs match the confirmed policy.
