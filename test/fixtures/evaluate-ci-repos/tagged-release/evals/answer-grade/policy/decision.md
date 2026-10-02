# Scoring policy decision

The adopter confirmed this policy on 2026-09-28 during Story 1.24 review. The policy ID is `answer-grade-critical-v1`, the severity floor is `low`, the catch threshold is `0.9`, and the minimum trial count is three. The confirmed intake already set three trials and ranked an unsafe pass as critical and a valid answer rejection as material.

The low floor includes every recorded defect class. With eval-quality's strict `caughtCount / validCount > catchThreshold` rule, three valid trials require three catches. The fixed `fixture-model-1` condition and deterministic evaluator remain as recorded in the policy and evaluation files. The prior `-proposed` ID belonged to the authoring handoff; this decision makes the selected policy final before the refreshed live runs.
